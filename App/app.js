const { Observable, from, of } = require('rxjs');var mqtt = require('./mqttCluster.js');
const {  map,shareReplay,startWith, filter,switchMap, distinctUntilChanged} = require('rxjs/operators');

global.mtqqLocalPath = process.env.MQTTLOCAL;
global.mtqqLocalPath = 'mqtt://192.168.0.11';




const rawDoorSensor = new Observable(async subscriber => {  
    var mqttCluster=await mqtt.getClusterAsync()   
    mqttCluster.subscribeData('zigbee2mqtt/0xa4c13881d0f4ad66', function(content){    
            subscriber.next(content)
    });
});




const doorSensor = rawDoorSensor.pipe( map(m => !m.contact))





doorSensor
.subscribe(async m => {
    const state = m?"ON":"OFF";
    (await mqtt.getClusterAsync()).publishData('zigbee2mqtt/0xa4c138e88b67d876/set',{state})
})




