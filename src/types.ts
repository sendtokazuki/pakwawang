export interface HealthRecord {
  id: string;
  timestamp: string;
  spo2: number | null;
  pulse: number | null;
  temperature: number | null;
  systolic: number | null;
  diastolic: number | null;
  blood_sugar: number | null;
  medications: string;
  caregiver_name: string;
  notes: string;
}

export type HealthMetric = 'spo2' | 'pulse' | 'temperature' | 'blood_pressure' | 'blood_sugar';
