import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Address search using Nominatim (OpenStreetMap) geocoding
  app.get("/api/address-search", async (req, res) => {
    const query = req.query.q as string;
    if (!query || query.length < 3) {
      return res.json({ results: [] });
    }

    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&countrycodes=us&format=json&addressdetails=1&limit=6`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "MortgageCalculator/1.0",
          "Accept": "application/json",
        },
      });
      
      if (!response.ok) {
        return res.json({ results: [] });
      }

      const data = await response.json();
      
      const results = data
        .filter((item: any) => {
          // Filter to residential-type results
          const type = item.type || "";
          const category = item.class || "";
          return (
            category === "place" ||
            category === "building" ||
            category === "highway" ||
            type === "house" ||
            type === "residential" ||
            type === "apartments" ||
            type === "suburb" ||
            type === "city" ||
            type === "town" ||
            type === "village" ||
            type === "hamlet" ||
            item.address?.house_number
          );
        })
        .map((item: any) => {
          const addr = item.address || {};
          return {
            displayName: item.display_name,
            street: [addr.house_number, addr.road].filter(Boolean).join(" "),
            city: addr.city || addr.town || addr.village || addr.hamlet || addr.suburb || "",
            state: addr.state || "",
            stateCode: addr["ISO3166-2-lvl4"]?.replace("US-", "") || "",
            zipCode: addr.postcode?.split("-")[0] || "",
            county: addr.county || "",
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon),
          };
        })
        .filter((r: any) => r.zipCode && r.stateCode);

      return res.json({ results });
    } catch (error) {
      console.error("Address search error:", error);
      return res.json({ results: [] });
    }
  });

  // Property data lookup using Zillow-like estimation
  // Uses address components to estimate property values
  app.get("/api/property-estimate", async (req, res) => {
    const { zipCode, stateCode } = req.query as { zipCode: string; stateCode: string };
    
    if (!zipCode) {
      return res.status(400).json({ error: "zipCode required" });
    }

    // We return zip-code based estimates that the frontend uses
    // The actual property data comes from user input or the address search
    return res.json({
      zipCode,
      stateCode: stateCode || "",
      message: "Use frontend zip-code lookup for tax/insurance estimates",
    });
  });

  return httpServer;
}
