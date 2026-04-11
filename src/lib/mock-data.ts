import type { MapIncidentPoint, UserReport, UserReputation } from "./types";
import { getSeverityForCategory } from "./category-severity";
import { getTrustDisplayText } from "./report-trust";

export const MELBOURNE_CENTER = {
  latitude: -37.8136,
  longitude: 144.9631,
  zoom: 13,
} as const;

export const currentUser: UserReputation = {
  score: 85,
  label: "Trusted Reporter",
  isTrusted: true,
};

export const userReports: UserReport[] = [
  {
    id: "r1",
    latitude: -37.8095,
    longitude: 144.9680,
    trustPoints: 10 + 42 - 2,
    category: "Physical Altercation",
    description: "Group of 6+ intimidating pedestrians near Flinders Lane",
    verifiedBy: 14,
    upvotes: 42,
    downvotes: 2,
    createdAt: new Date(Date.now() - 3 * 60 * 1000),
    userId: "u1",
    reporterId: "demo-u1",
    reporterDisplayName: "Jordan K.",
  },
  {
    id: "r2",
    latitude: -37.8120,
    longitude: 144.9655,
    trustPoints: 10 + 18 - 0,
    category: "Public Disturbance",
    description: "Dark alleyway with no foot traffic, felt very unsafe",
    verifiedBy: 8,
    upvotes: 18,
    downvotes: 0,
    createdAt: new Date(Date.now() - 12 * 60 * 1000),
    userId: "u2",
    reporterId: "demo-u2",
    reporterDisplayName: "Sam T.",
  },
  {
    id: "r3",
    latitude: -37.8150,
    longitude: 144.9590,
    trustPoints: 10 + 31 - 1,
    category: "Environmental Hazard",
    description: "Multiple streetlights out along Southbank Promenade",
    verifiedBy: 11,
    upvotes: 31,
    downvotes: 1,
    createdAt: new Date(Date.now() - 25 * 60 * 1000),
    userId: "u3",
    reporterId: "demo-u3",
    reporterDisplayName: "Riley M.",
  },
  {
    id: "r4",
    latitude: -37.8070,
    longitude: 144.9710,
    trustPoints: 10 + 27 - 3,
    category: "Theft / Robbery",
    description: "Phone snatched from hand near Southern Cross Station",
    verifiedBy: 5,
    upvotes: 27,
    downvotes: 3,
    createdAt: new Date(Date.now() - 45 * 60 * 1000),
    userId: "u4",
    reporterId: "demo-u4",
    reporterDisplayName: "Alex P.",
  },
  {
    id: "r5",
    latitude: -37.8110,
    longitude: 144.9720,
    trustPoints: 10 + 12 - 4,
    category: "Suspicious Behavior",
    description: "Individual following people through Queen Victoria Market",
    verifiedBy: 3,
    upvotes: 12,
    downvotes: 4,
    createdAt: new Date(Date.now() - 60 * 60 * 1000),
    userId: "u5",
    reporterId: "demo-u5",
    reporterDisplayName: "Casey L.",
  },
  {
    id: "r6",
    latitude: -37.8180,
    longitude: 144.9560,
    trustPoints: 10 + 35 - 2,
    category: "Substance Use",
    description: "Open drug use near Crown Casino underpass",
    verifiedBy: 9,
    upvotes: 35,
    downvotes: 2,
    createdAt: new Date(Date.now() - 90 * 60 * 1000),
    userId: "u6",
    reporterId: "demo-u6",
    reporterDisplayName: "Morgan D.",
  },
  {
    id: "r7",
    latitude: -37.8060,
    longitude: 144.9630,
    trustPoints: 10 + 22 - 1,
    category: "Harassment",
    description: "Verbal harassment reported near Melbourne Central",
    verifiedBy: 7,
    upvotes: 22,
    downvotes: 1,
    createdAt: new Date(Date.now() - 120 * 60 * 1000),
    userId: "u7",
    reporterId: "demo-u7",
    reporterDisplayName: "Taylor R.",
  },
  {
    id: "r8",
    latitude: -37.8100,
    longitude: 144.9600,
    trustPoints: 10 + 15 - 2,
    category: "Property Damage",
    description: "Car windows smashed on Little Collins Street",
    verifiedBy: 4,
    upvotes: 15,
    downvotes: 2,
    createdAt: new Date(Date.now() - 180 * 60 * 1000),
    userId: "u8",
    reporterId: "demo-u8",
    reporterDisplayName: "Jamie N.",
  },
];

export function userReportToMapPoint(r: UserReport): MapIncidentPoint {
  return {
    id: r.id,
    latitude: r.latitude,
    longitude: r.longitude,
    category: r.category,
    intensity: getSeverityForCategory(r.category),
    trustPoints: r.trustPoints,
  };
}

export function toGeoJSON(reports: MapIncidentPoint[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: reports.map((r) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [r.longitude, r.latitude],
      },
      properties: {
        id: r.id,
        category: r.category,
        intensity: r.intensity,
        trustPoints:
          r.trustPoints !== undefined && r.trustPoints !== null
            ? r.trustPoints
            : null,
        trustLabel:
          r.trustPoints !== undefined && r.trustPoints !== null
            ? getTrustDisplayText(r.trustPoints)
            : null,
      },
    })),
  };
}
