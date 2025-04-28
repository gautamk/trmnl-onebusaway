import { DurableObject } from 'cloudflare:workers';
import { OBAInterface } from './oba-interface';



type ArrivalsAndDepartures = {
	lastUpdateTime: string;
	lastUpdateTimeUnix: number;
	predictedArrivalTime: string;
	predictedArrivalTimeUnix: number;
	scheduledArrivalTime: string;
	scheduledArrivalTimeUnix: number;
	arrivalTime: string;
	arrivalTimeUnix: number;
	numberOfStopsAway: number;
	routeId: string;
	routeShortName: string;
	routeLongName: string;
	tripHeadsign: string;
	status: string;
	scheduleDeviation: number;
	predicted: boolean;
	stopId: string;
	stopName: string;
	delayUnix: number;
	delaySeconds: number;
};

export default {

	formatTime(dateTimeString: any, timeZone: string): string {
		return new Date(dateTimeString).toLocaleTimeString("en-US", { timeZone: timeZone });
	},
	async poll(params: URLSearchParams, env): Promise<Response>{
		const apiKey = params.get('apiKey')  || await env.OBA_API_KEY.get();
		const stopIds = params.get('stopIds');
		const timeZone = params.get('timezone') || 'America/Los_Angeles';
		if (!stopIds) {
			return Response.json({ error: 'stopIds is required' }, { status: 400 });
		} 
		if (!apiKey) {
			return Response.json({ error: `apiKey is required: "${apiKey}"` }, { status: 400 });
		}
		const arrivalsAndDepartures = new Array<ArrivalsAndDepartures>();
		const _stopIds = stopIds.split(',');
		
		
		console.log(`Processing stopIds:  ${_stopIds}`);
		const minutesAfter =  parseInt(params.get('minutesAfter') || '30');
		const minutesBefore = parseInt(params.get('minutesBefore') || '5');
		// Wait for all the promises to resolve
		const results = await Promise.allSettled(
			new OBAInterface(apiKey).getArrivalsAndDeparturesForStops(_stopIds, minutesAfter, minutesBefore)
		);
		
		// Iterate over the results and process them
		results.forEach((result, index) => {
			if (result.status === 'fulfilled') {
				const stopName = result.value.data.references.stops[0].name
				result.value.data.entry.arrivalsAndDepartures.forEach((arrivalDeparture: any) => {
					const arrivalTimeUnix = arrivalDeparture.predictedArrivalTime === 0 ?
						arrivalDeparture.scheduledArrivalTime :
						arrivalDeparture.predictedArrivalTime;
					const delayUnix:number = arrivalTimeUnix - arrivalDeparture.scheduledArrivalTime;
					const delaySeconds:number = delayUnix / 1000;
					arrivalsAndDepartures.push({
						// the time of the last update
						lastUpdateTime: this.formatTime(arrivalDeparture.lastUpdateTime, timeZone),
						// the time of the arrival either predicted if available otherwise scheduled
						arrivalTime: this.formatTime(arrivalTimeUnix, timeZone),
						// predicted arrival time of the vehicle
						predictedArrivalTime: this.formatTime(arrivalDeparture.predictedArrivalTime, timeZone),
						// scheduled arrival time of the vehicle
						scheduledArrivalTime: this.formatTime(arrivalDeparture.scheduledArrivalTime, timeZone),
						
						// millisecond unix epoch the time of the arrival either predicted if available otherwise scheduled
						arrivalTimeUnix: arrivalTimeUnix,
						// millisecond unix epoch the time of the last update
						lastUpdateTimeUnix: arrivalDeparture.lastUpdateTime,
						// millisecond unix epoch the predicted arrival time of the vehicle
						predictedArrivalTimeUnix: arrivalDeparture.predictedArrivalTime,
						// millisecond unix epoch the scheduled arrival time of the vehicle
						scheduledArrivalTimeUnix: arrivalDeparture.scheduledArrivalTime,

						// routeId in the format <agencyId>_<routeId>
						routeId: arrivalDeparture.routeId,
						// Short Identifier for the route Eg 372E, 
						routeShortName: arrivalDeparture.routeShortName,
						// Long Identifier 
						routeLongName: arrivalDeparture.routeLongName,

						// headsign on the bus
						tripHeadsign: arrivalDeparture.tripHeadsign,
						// status such as SCHEDULED, IN_PROGRESS, COMPLETED, CANCELED
						status: arrivalDeparture.status,
						// schedule deviation in seconds
						scheduleDeviation: arrivalDeparture.scheduleDeviation,
						predicted: arrivalDeparture.predicted,
						numberOfStopsAway: arrivalDeparture.numberOfStopsAway,
						stopId: arrivalDeparture.stopId,
						stopName: stopName,
						delayUnix: delayUnix,
						delaySeconds: delaySeconds,
					});
				});
				
			} else {
				// If the result is rejected, log the error
				console.error(`Error index ${index} status ${result.status}: ${result.reason}`);
			}
		});
		arrivalsAndDepartures.sort((ad: ArrivalsAndDepartures, ad2: ArrivalsAndDepartures) => {
			if (ad.arrivalTimeUnix < ad2.arrivalTimeUnix) {
				return -1;
			} else if (ad.arrivalTimeUnix > ad2.arrivalTimeUnix) {
				return 1;
			}
			return 0;
		});
		return Response.json({
			arrivalsAndDepartures: arrivalsAndDepartures,
			currentTime: new Date().toLocaleTimeString("en-US", {timeZone: timeZone}),
		});
	},

	async fetch(req: Request, env): Promise<Response> {
		let url = new URL(req.url);
		let params = url.searchParams;
		let stopIds = params.get('stopIds');
		if (!stopIds) {
			return Response.json({ error: 'stopIds is required' }, { status: 400 });
		}
		
		switch (url.pathname) {
			case '/poll':
			return await this.poll(params, env);
			case '/favicon.ico':
			return Response.json({}, { status: 404 });
			default:
			return Response.json({ error: 'Not found' }, { status: 404 });
		}		
	},
};

// Durable Object
export class ObaCache extends DurableObject {
	async getCounterValue() {
		let value = (await this.ctx.storage.get("value")) || 0;
		return value;
	}
	
	async increment(amount = 1) {
		let value = (await this.ctx.storage.get("value")) || 0;
		value += amount;
		// You do not have to worry about a concurrent request having modified the value in storage.
		// "input gates" will automatically protect against unwanted concurrency.
		// Read-modify-write is safe.
		await this.ctx.storage.put("value", value);
		return value;
	}
	
	async decrement(amount = 1) {
		let value = (await this.ctx.storage.get("value")) || 0;
		value -= amount;
		await this.ctx.storage.put("value", value);
		return value;
	}
}
// </docs-tag name="workflows-fetch-handler">
// </docs-tag name="full-workflow-example">
