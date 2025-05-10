export interface Request {
    length: number;
    quantity: number;
}

export interface Result {
    location_id: string;
    listing_ids: string[];
    total_price_in_cents: number;
}

export interface Vehicle {
    length: number;
    width: number;
}
  
export interface Listing {
    id: string;
    length: number;
    width: number;
    location_id: string;
    price_in_cents: number;
}

export interface Combination {
    listings: Listing[];
    totalPrice: number;
    location_id: string;
}
  