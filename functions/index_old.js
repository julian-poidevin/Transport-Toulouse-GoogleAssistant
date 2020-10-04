//   Toulouse Transport, action for the Google Assistant
//   Copyright (C) 2018  Quentin LAMBERT
//
//   This program is free software: you can redistribute it and/or modify
//   it under the terms of the GNU Affero General Public License as published
//   by the Free Software Foundation, either version 3 of the License, or
//   (at your option) any later version.
//
//   This program is distributed in the hope that it will be useful,
//   but WITHOUT ANY WARRANTY; without even the implied warranty of
//   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//   GNU Affero General Public License for more details.
//
//   You should have received a copy of the GNU Affero General Public License
//   along with this program.  If not, see <https://www.gnu.org/licenses/>.

'use strict';

/**
 * Constants
 */ 

// Path to the Tisseo API used by the request getting stops schedules, @see https://data.toulouse-metropole.fr/explore/dataset/api-temps-reel-tisseo/information/
const stopsSchedulesTisseoApiPath = '/v1/stops_schedules.json?timetableByArea=1&maxDays=1&number=3&key=<TISSEO_API_KEY>&stopAreaId=';


const dialogflow	= require('actions-on-google');	// Import the Dialogflow module from the Actions on Google client library.
const functions		= require('firebase-functions');	// Import the firebase-functions package for deployment.
const http			= require('https');

const app = dialogflow({ debug: true }); 

const strSpeechError = 'Aucun passage de transport en commun n\'a été trouvé. N\'hésitez pas à réessayer.';
const TimeUnit 		 = { SECOND: 'seconde', MINUTE: 'minute', HOUR: '' };


/**
 * Global variables
 */ 

var destinationIdToDestinationName;	// array mapping destination Id to distination name
var httpOptions = {
	host: 'api.tisseo.fr',
	path: ''
};


/**
 * Functions
 */ 

/**
 * Handle the Dialogflow intent named 'StopsSchedules'.
 *
 * @param {Object} conv : Dialogflow conversation object
 * @param {String} stopId : Identifier of the logical stop point where the user want to take public transit
 * @param {String} destinationId : (optional) Identifier of the logical stop point where the user want to go, or an empty string if is not set
 */
app.intent('StopsSchedules', (conv, {stopId, destinationId}) => {
	httpOptions.path = stopsSchedulesTisseoApiPath + stopId;

	// return a promise to handle this intent asynchronously
	return new Promise(function (resolve, reject) {
		let chunks = [];
		// perform HTTP request
		http.get(httpOptions, function (resp) {
			resp.on('data', function (chunk) {
					// store data in a buffer
					chunks.push(chunk);
				})
				.on('end', function () {
					const rawData    = Buffer.concat(chunks);
					const parsedData = JSON.parse(rawData);

					if (parsedData['departures']['stopAreas'].length > 0) {						
						const strCurrentStopName = parsedData['departures']['stopAreas'][0]['name'];
						
						// Get data from HTTP answer then build the speech
						let waitingTimesByDestination = getWaitingTimesFromTisseoData(parsedData);
						let strSpeech = buildStopsSchedulesSpeech(waitingTimesByDestination, strCurrentStopName, destinationId);

						conv.close(strSpeech);
					}
					else {
						// No one stopArea in JSON data received from Tisseo API 
						conv.close(strSpeechError);
					}

					resolve();
				});

		})
		.on("error", function (e) {
			conv.close(strSpeechError);
			reject(e);
		});
	});

});


/**
 * Build speech for StopsSchedules intent.
 *
 * @param {Array} waitingTimesByDestination : Array containing waiting times grouped by destination
 * @param {String} strCurrentStopName : Name of the current stop
 * @param {Integer} destinationId : Id of the destination stop
 * @return {String} Speech for StopsSchedules intent.
 */
function buildStopsSchedulesSpeech(waitingTimesByDestination, strCurrentStopName, destinationId) {
	let strSpeech = '<speak>';
	let strUserDestinationName = '';

	if (destinationId !== '') {
		// destinationId is set, so the user has told the destination parameter
		if (destinationId in destinationIdToDestinationName) {
			// destinationId is in the list of destination available at this stop
			strUserDestinationName = destinationIdToDestinationName[destinationId];
			strSpeech += 'Les prochains passages à l\'arrêt ' + strCurrentStopName + ' en direction de ' + strUserDestinationName + ' sont dans ';
			strSpeech += waitingTimeToString(waitingTimesByDestination[strUserDestinationName]) + '. ';
		}
		else {
			// destinationId is NOT in the list of destination available at this stop
			strSpeech += 'Je n\'ai pas saisi la destination, mais ';
		}
	}

	// if destinationName is not set, tell all destinations available at this stop
	if (strUserDestinationName === '') {
		let strDestinationIntroduction = '';
		const numDestinations = Object.keys(waitingTimesByDestination).length;
		if (numDestinations > 2) {
			strDestinationIntroduction = ' en fonctions des ' + numDestinations + ' différentes déstinations';
		}

		strSpeech += 'Voici les prochains passages à l\'arrêt ' + strCurrentStopName + strDestinationIntroduction + '. ';
		let strHelperIntroduction = 'les prochains passages sont ';
		for (let destination in waitingTimesByDestination) {
			strSpeech += 'En direction de ' + destination + ', ' + strHelperIntroduction + 'dans ' + waitingTimeToString(waitingTimesByDestination[destination]) + '. ';
			strHelperIntroduction = ''; // tell only the first occurence
		}
	}

	// Ending
	strSpeech += '<break time="0.5s"/>A bientôt.</speak>';

	return strSpeech;
}


/**
 * Get waiting times at the current stop and fill destinationIdToDestinationName array mapping destination Id to distination name.
 *
 * @param {Array} parsedData : Array containing JSON parsed data from Tisseo API
 * @return {Array} Array containing waiting times grouped by destination under the following structure: waitingTimesByDestination[strDestinationName] -> destinationWaitingTimes
 */
function getWaitingTimesFromTisseoData(parsedData) {
	let waitingTimesByDestination = [];
	const schedules = parsedData['departures']['stopAreas'][0]['schedules'];

	for (var iSchedule = 0; iSchedule < schedules.length; iSchedule++) {
		let schedule = schedules[iSchedule];		
		let strDestinationName = schedule['destination'].name;

		destinationIdToDestinationName[schedule.destination.id] = strDestinationName;
		
		// initialize waitingTimesByDestination array for the destination if it doesn't already exist
        if(typeof waitingTimesByDestination[strDestinationName] === 'undefined')
        {
		    waitingTimesByDestination[strDestinationName] = [];
        }
	
		// fill waitingTimesByDestination array
		for (var iJourney = 0; iJourney < schedule['journeys'].length; iJourney++) {
			waitingTimesByDestination[strDestinationName].push(schedule['journeys'][iJourney].waiting_time);
		}

		// sort waiting times by ascending order
		waitingTimesByDestination[strDestinationName].sort();
	}

	return waitingTimesByDestination;
}


/**
 * Convert a time string under "hh:mm:ss" format to a human listenable short time.
 * Below are some examples of conversions:
 * 	"00:00:37" => {37, TimeUnit.SECOND}
 * 	"00:02:30" => {2, TimeUnit.MINUTE}
 * 	"01:05:30" => {'une heure 5 minutes', TimeUnit.HOUR}
 * 	"02:05:30" => {'dans plus de 2 heures', TimeUnit.HOUR}
 *
 * @param {String} timeString : time string under the "hh:mm:ss" format
 * @return {Object} .value : String containing a short time ; .timeUnit : value from TimeUnit enumeration of the greatest time unit present in .value
 */
function timeToShortTime(timeString) {
	let result = [];

	const timeByUnit = timeString.split(':');

	const hour 	 = parseInt(timeByUnit[0]);
	const minute = parseInt(timeByUnit[1]);

	result.value = minute;	// remove leading '0'

	if (hour > 0) {
		if (hour >= 2) {
			result.value = 'dans plus de 2 heures';
		}
		else {
			result.value = hour + ' heure ' + result.value + ' minutes';
		}
		result.timeUnit = TimeUnit.HOUR;
	}
	else if (minute <= 0) {
		result.value = parseInt(timeByUnit[2]);
		result.timeUnit = TimeUnit.SECOND;
	}
	else {
		result.timeUnit = TimeUnit.MINUTE;
	}

	// Convert '1' number into 'une' in order to have the proper prononciation ('une seconde/minute/heure' and not 'un seconde')
	if (result.value == 1) {
		result.value = 'une';
	}

	return result;
}


/**
 * Convert two waiting times into human listenable waiting times
 * Below are some examples of conversions:
 * 	{"00:00:45", "00:15:00"} => "45 secondes puis dans 15 minutes"
 * 	{"00:10:00", "00:15:00"} => "10 puis dans 15 minutes"
 * 	{"00:01:00"} => "1 minute"
 *
 * @param {Object} waitingTimes :  Array of 1 or 2 time strings under "hh:mm:ss" format
 * @return {String} Human listenable waiting times
 */
function waitingTimeToString(waitingTimes) {
	let strWaitingTimes;

	const strWaitingTime0 = timeToShortTime(waitingTimes[0]);
	strWaitingTimes = strWaitingTime0.value + ' ';

	if (waitingTimes.length > 1) {
		// there is two next passages in the array
		const strWaitingTime1 = timeToShortTime(waitingTimes[1]);

		if (strWaitingTime0.timeUnit != strWaitingTime1.timeUnit) {
			// the two next passages have different time units, so time unit is told each time
			strWaitingTimes += strWaitingTime0.timeUnit;
			if(strWaitingTime0.value > 1) strWaitingTimes += 's';
		}

		strWaitingTimes += ' puis dans ' + strWaitingTime1.value + ' ' + strWaitingTime1.timeUnit;
		if(strWaitingTime1.value > 1) strWaitingTimes += 's';
	}
	else {
		// there is only one next passage
		strWaitingTimes += strWaitingTime0.timeUnit;
		if(strWaitingTime0.value > 1) strWaitingTimes += 's';
	}

	return strWaitingTimes;
}


// Set the DialogflowApp object to handle the HTTPS POST request.
exports.dialogflowFirebaseFulfillment = functions.https.onRequest(app);