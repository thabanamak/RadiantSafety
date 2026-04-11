/**
 * Major Victoria Police stations (approximate map coordinates).
 * For planning only — verify addresses for operational use.
 */
export interface PoliceStation {
  id: string;
  name: string;
  suburb: string;
  latitude: number;
  longitude: number;
}

export const VIC_POLICE_STATIONS: PoliceStation[] = [
  { id: "melbourne-spencer", name: "Melbourne Police Station", suburb: "Melbourne", latitude: -37.8152, longitude: 144.9538 },
  { id: "docklands", name: "Docklands Police Station", suburb: "Docklands", latitude: -37.8144, longitude: 144.9422 },
  { id: "carlton", name: "Carlton Police Station", suburb: "Carlton", latitude: -37.8006, longitude: 144.9674 },
  { id: "collingwood", name: "Collingwood Police Station", suburb: "Collingwood", latitude: -37.8012, longitude: 144.9839 },
  { id: "fitzroy", name: "Fitzroy Police Station", suburb: "Fitzroy", latitude: -37.8065, longitude: 144.9786 },
  { id: "richmond", name: "Richmond Police Station", suburb: "Richmond", latitude: -37.8185, longitude: 145.0014 },
  { id: "south-yarra", name: "South Yarra Police Station", suburb: "South Yarra", latitude: -37.8388, longitude: 144.9917 },
  { id: "prahran", name: "Prahran Police Station", suburb: "Prahran", latitude: -37.8504, longitude: 144.9939 },
  { id: "st-kilda", name: "St Kilda Police Station", suburb: "St Kilda", latitude: -37.8677, longitude: 144.9809 },
  { id: "port-melbourne", name: "Port Melbourne Police", suburb: "Port Melbourne", latitude: -37.8403, longitude: 144.9429 },
  { id: "footscray", name: "Footscray Police Station", suburb: "Footscray", latitude: -37.7996, longitude: 144.8998 },
  { id: "sunshine", name: "Sunshine Police Station", suburb: "Sunshine", latitude: -37.781, longitude: 144.8316 },
  { id: "broadmeadows", name: "Broadmeadows Police Station", suburb: "Broadmeadows", latitude: -37.6807, longitude: 144.9208 },
  { id: "heidelberg", name: "Heidelberg Police Station", suburb: "Heidelberg", latitude: -37.7553, longitude: 145.0691 },
  { id: "preston", name: "Preston Police Station", suburb: "Preston", latitude: -37.7388, longitude: 145.0043 },
  { id: "epping", name: "Epping Police Station", suburb: "Epping", latitude: -37.649, longitude: 145.0124 },
  { id: "box-hill", name: "Box Hill Police Station", suburb: "Box Hill", latitude: -37.819, longitude: 145.127 },
  { id: "ringwood", name: "Ringwood Police Station", suburb: "Ringwood", latitude: -37.8128, longitude: 145.2268 },
  { id: "dandenong", name: "Dandenong Police Station", suburb: "Dandenong", latitude: -37.9872, longitude: 145.2152 },
  { id: "frankston", name: "Frankston Police Station", suburb: "Frankston", latitude: -38.1427, longitude: 145.1251 },
  { id: "moorabbin", name: "Moorabbin Police Station", suburb: "Moorabbin", latitude: -37.9399, longitude: 145.0541 },
  { id: "werribee", name: "Werribee Police Station", suburb: "Werribee", latitude: -37.9059, longitude: 144.6586 },
  { id: "geelong", name: "Geelong Police Station", suburb: "Geelong", latitude: -38.1491, longitude: 144.3603 },
  { id: "ballarat", name: "Ballarat Police Station", suburb: "Ballarat", latitude: -37.5624, longitude: 143.8501 },
  { id: "bendigo", name: "Bendigo Police Station", suburb: "Bendigo", latitude: -36.7572, longitude: 144.2792 },
  { id: "shepparton", name: "Shepparton Police Station", suburb: "Shepparton", latitude: -36.3789, longitude: 145.3987 },
  { id: "mildura", name: "Mildura Police Station", suburb: "Mildura", latitude: -34.1858, longitude: 142.1625 },
  { id: "warrnambool", name: "Warrnambool Police Station", suburb: "Warrnambool", latitude: -38.3833, longitude: 142.487 },
  { id: "morwell", name: "Morwell Police Station", suburb: "Morwell", latitude: -38.2347, longitude: 146.3951 },
  { id: "sale", name: "Sale Police Station", suburb: "Sale", latitude: -38.1069, longitude: 147.0678 },
];
