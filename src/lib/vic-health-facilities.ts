/**
 * Major hospitals and larger medical centres (approximate entrances).
 * For planning only — verify for clinical or emergency use.
 */
export type HealthFacilityKind = "hospital" | "medical_centre";

export interface HealthFacility {
  id: string;
  name: string;
  suburb: string;
  latitude: number;
  longitude: number;
  kind: HealthFacilityKind;
}

export const VIC_HEALTH_FACILITIES: HealthFacility[] = [
  { id: "rmh", name: "Royal Melbourne Hospital", suburb: "Parkville", latitude: -37.7994, longitude: 144.9564, kind: "hospital" },
  { id: "rwh", name: "Royal Women's Hospital", suburb: "Parkville", latitude: -37.7999, longitude: 144.9558, kind: "hospital" },
  { id: "rch", name: "Royal Children's Hospital", suburb: "Parkville", latitude: -37.7935, longitude: 144.9485, kind: "hospital" },
  { id: "st-vincents", name: "St Vincent's Hospital Melbourne", suburb: "Fitzroy", latitude: -37.8078, longitude: 144.9756, kind: "hospital" },
  { id: "alfred", name: "The Alfred", suburb: "Prahran", latitude: -37.8456, longitude: 144.9828, kind: "hospital" },
  { id: "epworth-richmond", name: "Epworth Richmond", suburb: "Richmond", latitude: -37.8187, longitude: 145.0012, kind: "hospital" },
  { id: "peter-mac", name: "Peter MacCallum Cancer Centre", suburb: "Melbourne", latitude: -37.8055, longitude: 144.9555, kind: "hospital" },
  { id: "monash-medical", name: "Monash Medical Centre", suburb: "Clayton", latitude: -37.9122, longitude: 145.1346, kind: "hospital" },
  { id: "austin", name: "Austin Hospital", suburb: "Heidelberg", latitude: -37.7569, longitude: 145.0628, kind: "hospital" },
  { id: "box-hill-hosp", name: "Box Hill Hospital", suburb: "Box Hill", latitude: -37.8195, longitude: 145.1205, kind: "hospital" },
  { id: "footscray-hosp", name: "Footscray Hospital", suburb: "Footscray", latitude: -37.8015, longitude: 144.8969, kind: "hospital" },
  { id: "sunshine-hosp", name: "Sunshine Hospital", suburb: "St Albans", latitude: -37.7822, longitude: 144.8336, kind: "hospital" },
  { id: "northern-hosp", name: "Northern Hospital", suburb: "Epping", latitude: -37.6489, longitude: 145.016, kind: "hospital" },
  { id: "frankston-hosp", name: "Frankston Hospital", suburb: "Frankston", latitude: -38.1456, longitude: 145.1257, kind: "hospital" },
  { id: "geelong-hosp", name: "University Hospital Geelong", suburb: "Geelong", latitude: -38.0956, longitude: 144.3624, kind: "hospital" },
  { id: "werribee-mercy", name: "Werribee Mercy Hospital", suburb: "Werribee", latitude: -37.8967, longitude: 144.6568, kind: "hospital" },
  { id: "cohealth-collingwood", name: "Cohealth Collingwood", suburb: "Collingwood", latitude: -37.8045, longitude: 144.9838, kind: "medical_centre" },
  { id: "ipc-reservoir", name: "IPC Health Reservoir", suburb: "Reservoir", latitude: -37.716, longitude: 145.002, kind: "medical_centre" },
  { id: "north-richmond", name: "North Richmond Community Health", suburb: "Richmond", latitude: -37.8148, longitude: 144.9895, kind: "medical_centre" },
  { id: "bentleigh-clinic", name: "Bentleigh Medical Centre", suburb: "Bentleigh", latitude: -37.918, longitude: 145.035, kind: "medical_centre" },
  { id: "oakleigh-clinic", name: "Oakleigh Superclinic", suburb: "Oakleigh", latitude: -37.902, longitude: 145.086, kind: "medical_centre" },
  { id: "point-cook-mc", name: "Point Cook Medical Centre", suburb: "Point Cook", latitude: -37.882, longitude: 144.736, kind: "medical_centre" },
  { id: "bundoora-mc", name: "Plenty Road Medical Centre", suburb: "Bundoora", latitude: -37.698, longitude: 145.062, kind: "medical_centre" },
  { id: "dandenong-mc", name: "Dandenong Superclinic", suburb: "Dandenong", latitude: -37.981, longitude: 145.214, kind: "medical_centre" },
];
