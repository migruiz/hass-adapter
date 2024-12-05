const { Observable, from, of } = require('rxjs'); var mqtt = require('./mqttCluster.js');
const { map, shareReplay, startWith, filter, switchMap, distinctUntilChanged, share, scan } = require('rxjs/operators');

global.mtqqLocalPath = process.env.MQTTLOCAL;
global.mtqqLocalPath = 'mqtt://192.168.0.11';





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


const HISTORY_NUMBER = 4
const CAT_HOUSE_WEIGHT = 5
const CAT_WEIGHT_THRESHOLD = 3

const getAverageKg = (history) => {
    const average = history.reduce((sum, currentValue) => sum + currentValue, 0) / history.length
    return (Math.round(average * 10) / 10)
}

const getCatState = ({ estimatedAction, prevCatState, averageKg, stableReadings }) => {
    if (!stableReadings) {
        return 'unknown';
    }
    if (!prevCatState) {
        return averageKg - CAT_HOUSE_WEIGHT < CAT_WEIGHT_THRESHOLD ? 'catOut' : 'catIn'
    }
    if (estimatedAction === 'noChange') {
        return prevCatState
    }
    return estimatedAction;
}

const estimateAction = ({ currentKg, averageKg }) => {
    if (Math.abs(currentKg - averageKg) < CAT_WEIGHT_THRESHOLD) {
        return 'noChange'
    }
    if (currentKg - averageKg >= CAT_WEIGHT_THRESHOLD) {
        return 'catIn'
    }
    if (currentKg - averageKg <= -1 * CAT_WEIGHT_THRESHOLD) {
        return 'catOut'
    }
}

const scaleReadings = sharedReadings.pipe(
    filter(r => r.messageType === "scale"),
    filter(r => r.value > -5000),
    map(r => ({ ...r, valuekg: (Math.round(r.value / 100) / 10) })),
    scan((acc, curr) => {
        const newHistory = [curr.valuekg, ...acc.history].slice(0, HISTORY_NUMBER)
        const stableReadings = newHistory.length === HISTORY_NUMBER
        if (!stableReadings) {
            return {
                history: newHistory,
                ignoreEmission: true
            }
        }
        const averageKg = getAverageKg(newHistory)
        const estimatedAction = estimateAction({ currentKg: curr.valuekg, averageKg })
        const catState = getCatState({estimatedAction, prevCatState: acc.catState, averageKg, stableReadings})
        return {
            ...curr,
            history: newHistory,
            averageKg,
            estimatedAction,
            catState
        }
    }, { history: [] }),


)


scaleReadings
    .subscribe(async m => {
        console.log(JSON.stringify(m))
    })


return;


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

