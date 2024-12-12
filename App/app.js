const { Observable, from, of } = require('rxjs'); var mqtt = require('./mqttCluster.js');
const { map, shareReplay, startWith, filter, switchMap, distinctUntilChanged, share, scan } = require('rxjs/operators');

global.mtqqLocalPath = process.env.MQTTLOCAL;
global.mtqqLocalPath = 'mqtt://192.168.0.11';

const HOME_WEIGHT = process.env.HOME_WEIGHT || 7.7

const AWAY_WEIGHT = process.env.HOME_WEIGHT || 4.6

const CUTOFF_WEIGHT = (HOME_WEIGHT + AWAY_WEIGHT) / 2

console.log(` CAT HOUSE  CUTOFF WEIGHT ${CUTOFF_WEIGHT}`)



const wintercatReadings = new Observable(async subscriber => {
    var mqttCluster = await mqtt.getClusterAsync()
    mqttCluster.subscribeData('WINTERCAT/readings', function (content) {
        subscriber.next(content)
    });
});


const getZoneTempStream = ({ sharedReadings, channel }) => {
    return sharedReadings.pipe(
        filter(r => r.messageType === "oregonReading" && r.channel === channel),
        map(r => ({ ...r, timestamp: (new Date()).getTime() })),
        scan((acc, curr) => {
            const currentTemperature = parseFloat(curr.temperature)
            if (!acc.prevTemperature || (new Date()).getTime() - acc.timestamp > 30 * 60 * 1000 || Math.abs(currentTemperature - acc.prevTemperature) < 10) {
                return {
                    ...curr,
                    prevTemperature: currentTemperature,
                    processMessage: true
                }
            }
            else {
                return {
                    ...acc,
                    processMessage: false
                }
            }
        }, {}),
        filter(r => r.processMessage)
    )
}

const sharedReadings = wintercatReadings.pipe(share())

const houseCatReadings = getZoneTempStream({ sharedReadings, channel: "3" })

const outsideReadings = getZoneTempStream({ sharedReadings, channel: "1" })

const heatingRelayReadings = sharedReadings.pipe(
    filter(r => r.messageType === "relayChange"),
    map(r => r.value ? 'ON' : 'OFF')
)


const scaleReadings = sharedReadings.pipe(
    filter(r => r.messageType === "scale"),
    filter(r => r.value > -5000),
    map(r => ({ ...r, valuekgNum: (Math.round(r.value / 100) / 10) })),
    map(r => ({ ...r, valuekg: r.valuekgNum.toFixed(1) })),
    map(r => ({ ...r, presence: r.valuekgNum >= CUTOFF_WEIGHT ? "ON" : "OFF" }))
)


heatingRelayReadings
    .subscribe(async m => {
        (await mqtt.getClusterAsync()).publishMessage('WINTERCAT/heating/relay', m)
    })


scaleReadings
    .subscribe(async m => {
        (await mqtt.getClusterAsync()).publishData('WINTERCAT/scale', m);
        (await mqtt.getClusterAsync()).publishMessage('WINTERCAT/house/presence', m.presence)

    })


houseCatReadings
    .subscribe(async m => {
        (await mqtt.getClusterAsync()).publishData('WINTERCAT/house/weather', m)
    })


outsideReadings
    .subscribe(async m => {
        (await mqtt.getClusterAsync()).publishData('WINTERCAT/outside/weather', m)
    })

