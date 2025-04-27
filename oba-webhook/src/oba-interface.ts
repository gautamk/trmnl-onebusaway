
import OnebusawaySDK from 'onebusaway-sdk';
import { APIPromise } from 'onebusaway-sdk/core';


export class OBAInterface {

    private sdk: OnebusawaySDK;

    constructor(apiKey: string) {
        this.sdk = new OnebusawaySDK({
            apiKey: apiKey,
        });
    }

    async getArrivalsAndDepartures(stopId: string, minutesAfter=15, minutesBefore=15 ) {
        return this.sdk.arrivalAndDeparture.list(stopId, {
            minutesAfter: minutesAfter,
            minutesBefore: minutesBefore,
        });
    }

    getArrivalsAndDeparturesForStops(stopIds: string[], minutesAfter=15, minutesBefore=15){
        return stopIds.map((stopId) => this.getArrivalsAndDepartures(stopId, minutesAfter, minutesBefore));
    }
}