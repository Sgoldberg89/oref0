var tz = require('timezone');
var calcMealCOB = require('oref0/lib/determine-basal/cob-autosens');
var basal = require('oref0/lib/profile/basal');
var get_iob = require('oref0/lib/iob');
var isf = require('../profile/isf');

function diaCarbs(opts, time) {
    var treatments = opts.treatments;
    var profile_data = opts.profile;
    if (typeof(opts.glucose) !== 'undefined') {
        var glucose_data = opts.glucose;
    }
    var boluses = 0;
    var carbDelay = 20 * 60 * 1000;
    var maxCarbs = 0;
    var mealCarbTime = time.getTime();
    if (!treatments) return {};

    //console.error(glucose_data);
    var iob_inputs = {
        profile: profile_data
    ,   history: opts.pumphistory
    };
    var COB_inputs = {
        glucose_data: glucose_data
    ,   iob_inputs: iob_inputs
    ,   basalprofile: opts.basalprofile
    ,   mealTime: mealCarbTime
    };
    var mealCOB = 0;
    var csf_glucose_data = [];
    var isf_glucose_data = [];
    var basal_glucose_data = [];

    glucose_data.forEach(function(glucose_datum) {
        var bgDate = new Date(tz(glucose_datum.dateString));
        var bgTime = bgDate.getTime();
        COB_inputs.bgTime = bgDate;
        mealCOB = 0;
        var carbs = 0;
        treatments.forEach(function(treatment) {
            var dia_ago = bgTime - 1.5*profile_data.dia*60*60*1000;
            var treatmentDate = new Date(tz(treatment.timestamp));
            var treatmentTime = treatmentDate.getTime();
            if (treatmentTime > dia_ago && treatmentTime <= bgTime) {
                if (treatment.carbs >= 1) {
                    //console.error(treatment.carbs, maxCarbs, treatmentDate);
                    carbs += parseFloat(treatment.carbs);
                    COB_inputs.mealTime = treatmentTime;
                    var myCarbsAbsorbed = calcMealCOB(COB_inputs).carbsAbsorbed;
                    //console.error("myCarbsAbsorbed: ",myCarbsAbsorbed);
                    var myMealCOB = Math.max(0, carbs - myCarbsAbsorbed);
                    //console.error("myMealCOB: ",myMealCOB);
                    mealCOB = Math.max(mealCOB, myMealCOB);
                }
                if (treatment.bolus >= 0.1) {
                    boluses += parseFloat(treatment.bolus);
                }
            }
        });
        console.error("MealCOB: ",mealCOB);
        if (mealCOB > 0) {
            csf_glucose_data.push(glucose_datum);
            return;
        }
        // Go through the remaining time periods and divide them into periods where scheduled basal insulin activity dominates. This would be determined by calculating the BG impact of scheduled basal insulin (for example 1U/hr * 48 mg/dL/U ISF = 48 mg/dL/hr = 5 mg/dL/5m), and comparing that to BGI from bolus and net basal insulin activity.
        var sens = isf.isfLookup(iob_inputs.profile.isfProfile,bgDate);
        iob_inputs.clock=glucose_datum.dateString;
        currentBasal = basal.basalLookup(opts.basalprofile, bgDate);
        iob_inputs.profile.current_basal = currentBasal;
        basalBgi = Math.round(( currentBasal * sens / 60 * 5 )*100)/100; // U/hr * mg/dL/U * 1 hr / 60 minutes * 5 = mg/dL/5m 
        //console.log(JSON.stringify(iob_inputs.profile));
        var iob = get_iob(iob_inputs)[0];
        //console.log(JSON.stringify(iob));

        var bgi = Math.round(( -iob.activity * sens * 5 )*100)/100;
        console.error("basal BGI: ",basalBgi,", BGI: ",bgi);
        if (basalBgi > bgi) {
            basal_glucose_data.push(glucose_datum);
        } else {
            isf_glucose_data.push(glucose_datum);
        }
    });

    return {
        csf_glucose_data: csf_glucose_data,
        isf_glucose_data: isf_glucose_data,
        basal_glucose_data: basal_glucose_data
    };
}

exports = module.exports = diaCarbs;
