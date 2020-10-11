'use strict';

/**
 * Constants
 */ 

// Path to the OpenData API used by the request getting stops schedules, @see https://opendata.bordeaux-metropole.fr/explore/dataset/sv_horai_a/information/
const stopsSchedulesOpenDataApiPath = '/wfs?key=[VOTRECLE]&REQUEST=GetFeature&SERVICE=WFS&VERSION=1.1.0&TYPENAME=bm:SV_HORAI_A&gid=';


const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const http  = require('https');

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements


/**
 * Global variables
 */ 

var destinationIdToDestinationName;	// array mapping destination Id to distination name
var httpOptions = {
	host: 'data.bordeaux-metropole.fr',
	path: ''
};


exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
    const agent = new WebhookClient({ request, response });
    console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
    console.log('Dialogflow Request body: ' + JSON.stringify(request.body));
   
    // function welcome(agent) {
    //   agent.add(`Welcome to my agent!`);
    // }
   
    // function fallback(agent) {
    //   agent.add(`I didn't understand`);
    //   agent.add(`I'm sorry, can you try again?`);
    // }
  
    function StopsSchedules(agent) {
      let arret = agent.parameters.stop;
      let destination = agent.parameters.destination;

      let chunks = [];
      // perform HTTP request
		  http.get(httpOptions, function (resp) {
        resp.on('data', function (chunk) {
            // store data in a buffer
            chunks.push(chunk);
          })
          .on('end', function() {

          });
      })

      //agent.add(`L'arrêt demandé est ${stop} et la destionation est ${destination}`);
    }
    // See https://github.com/dialogflow/fulfillment-actions-library-nodejs
    // for a complete Dialogflow fulfillment library Actions on Google client library v2 integration sample
  
    // Run the proper function handler based on the matched Dialogflow intent name
    let intentMap = new Map();
    // intentMap.set('Default Welcome Intent', welcome);
    // intentMap.set('Default Fallback Intent', fallback);
    intentMap.set('StopsSchedules', prochainTramway);
    agent.handleRequest(intentMap);
  });