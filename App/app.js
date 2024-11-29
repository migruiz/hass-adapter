const { Observable, from, of } = require('rxjs'); var mqtt = require('./mqttCluster.js');
const { map, shareReplay, startWith, filter, switchMap, distinctUntilChanged, share } = require('rxjs/operators');

global.mtqqLocalPath = process.env.MQTTLOCAL;
global.mtqqLocalPath = 'mqtt://192.168.0.11';



const wintercatReadings = new Observable(async subscriber => {
    var mqttCluster = await mqtt.getClusterAsync()
    mqttCluster.subscribeData('WINTERCAT/readings', function (content) {
        subscriber.next(content)
    });
});

const sharedReadings = wintercatReadings.pipe(share())

const houseCatReadings = sharedReadings.pipe(
    filter(r => r.messageType === "oregonReading" && r.channel === "3")
)

const outsideReadings = sharedReadings.pipe(
    filter(r => r.messageType === "oregonReading" && r.channel === "1")
)

const heatingRelayReadings = sharedReadings.pipe(
    filter(r => r.messageType === "relayChange"),
    map(r => r.value ? 'ON' : 'OFF')
)

heatingRelayReadings
    .subscribe(async m => {
        (await mqtt.getClusterAsync()).publishMessage('WINTERCAT/heating/relay', m)
    })


houseCatReadings
    .subscribe(async m => {
        (await mqtt.getClusterAsync()).publishData('WINTERCAT/house/weather', m)
    })


outsideReadings
    .subscribe(async m => {
        (await mqtt.getClusterAsync()).publishData('WINTERCAT/outside/weather', m)
    })

