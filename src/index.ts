import { Context, APIGatewayProxyResult, APIGatewayEvent } from 'aws-lambda';
import { Request, Listing, Vehicle, Combination, Result } from './types';
import fs from 'fs';

const groupBy = <T, K extends keyof any>(arr: T[], key: (i: T) => K) =>
    arr.reduce((groups, item) => {
      (groups[key(item)] ||= []).push(item);
      return groups;
    }, {} as Record<K, T[]>);

// preprocess listing data before request
const listingData: Listing[] = JSON.parse(fs.readFileSync('listings.json', 'utf-8'));

// group listings by location
const locations = groupBy(listingData, i => i.location_id);

// for each location, create all possible combinations of listings, and sort them by cost
let combinationMap = new Map<string, Listing[][]>();
for (const [locationId, locationListings] of Object.entries(locations)) {
    let combinations = generateCombinationsOfListings(locationListings);
    combinations.sort((a, b) => 
        a.reduce((sum, listing) => sum + listing.price_in_cents, 0) - b.reduce((sum, listing) => sum + listing.price_in_cents, 0)
    );

    combinationMap.set(locationId, combinations)
}

// Check if a set of vehicles can fit in a set of listings
function canFitVehicles(selectedListings: Listing[], vehicles: Vehicle[]): boolean {
    const remainingVehicles = [...vehicles];
    
    for (const listing of selectedListings) {
        const rows = Math.floor(listing.width / 10);
        
        // reresents the space available in the listing. Since we are assuming all vehicles
        // are the same width, each index is a row (10 feet). The value is the length available
        const space = Array(rows).fill(listing.length);
        
        // Sort remaining vehicles by descending length
        remainingVehicles.sort((a, b) => b.length - a.length);
        
        // Try to fit each vehicle in the rows
        let i = 0;
        while (i < remainingVehicles.length) {
            const vehicle = remainingVehicles[i];
            
            // Sort rows by remaining length (descending)
            space.sort((a, b) => b - a); 

            // Try to place the vehicle in the row with the most remaining space
            if (space[0] >= vehicle.length) {
                // if the vehicle fits, remove the available space from the listing
                // and remove the vehicle from the remaining list
                space[0] -= vehicle.length;
                remainingVehicles.splice(i, 1);
            } else {
                // if the vehicle doesn't fit, try the next largest one
                i++;
            }
        }
    }
    
    // If all vehicles are placed, this combination works
    return remainingVehicles.length === 0;
}

// Get All possible combinations of the provided listings
function generateCombinationsOfListings(listings: Listing[]): Listing[][] {
    const result: Listing[][] = [[]];
    for (const listing of listings) {
        const newSubset = result.map(subset => [...subset, listing])
        result.push(...newSubset);
    }
    return result;
}

function findCheapestPriceForLocation(listings: Listing[], vehicles: Vehicle[]): Combination | null {
    // get all the combinations for the location
    // these should come sorted from our preprocessing
    const combinations = combinationMap.get(listings[0].location_id)
    if (!combinations) {
        return null;
    }

    // for each combination, check if all the vehicles can fit. Since combinations are sorted by cost
    // the first combination that can fit all vehicles should be the cheapest so return it
    for (const combination of combinations) {
        if (canFitVehicles(combination, vehicles)) {
            return { 
                listings: combination, 
                total_price_in_cents: combination.reduce((sum, listing) => sum + listing.price_in_cents, 0),
            }
        }
    }
    
    // If no valid combinations were found, return null
    return null
}

function processRequest(requests: Request[]) {
    const results: Result[] = [];

    // convert request into list of vehicles
    const vehicles: Vehicle[] = requests.flatMap(req => 
        Array(req.quantity).fill({ length: req.length, width: 10 })
    );

    // find the cheapest solution for each location
    for (const [locationId, locationListings] of Object.entries(locations)) {
        const combination = findCheapestPriceForLocation(locationListings, vehicles);
        if (combination != null) {
            results.push({
                location_id: locationId,
                listing_ids: combination.listings.map(l => l.id),
                total_price_in_cents: combination.total_price_in_cents
            });
        }
    }

    // Sort solutions by total price
    results.sort((a, b) => a.total_price_in_cents - b.total_price_in_cents);
    
    return results;
}


export const handler = async (event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> => {
    const request: Request[] = JSON.parse(event.body || '{}')
    const results = processRequest(request);
    console.log(`Event: ${JSON.stringify(event, null, 2)}`);
    console.log(`Context: ${JSON.stringify(context, null, 2)}`);
    return {
        statusCode: 200,
        body: JSON.stringify(results, null, 2),
    };
};
