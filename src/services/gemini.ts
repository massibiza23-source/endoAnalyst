import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface BloodTestResult {
  parameter: string;
  value: string;
  unit: string;
  referenceRange: string;
  interpretation: "Normal" | "Leve" | "Moderado" | "Grave";
  briefNote: string;
}

export interface UserProfile {
  conditions: string[];
  otherConditions?: string;
  medications?: string;
}

export interface GlucoseAnalysis {
  timeInRange: string;
  averageGlucose: string;
  variability: string;
  patterns: string[];
  estimatedHbA1c: string;
  insulinFactors?: {
    sensitivitySuggestion: string;
    carbRatioNote: string;
    warning: string;
  };
}

export interface AnalysisReport {
  results: BloodTestResult[];
  medicalInterpretation: string;
  alertLevel: "Normal" | "Seguimiento" | "Revisión médica recomendada";
  analysisDate?: string;
  doctorName?: string;
  clinicName?: string;
  recommendations: {
    habits: string[];
    supplements: string[];
    specialist: string;
  };
  missingData: string[];
  glucoseAnalysis?: GlucoseAnalysis;
}

const ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    results: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          parameter: { type: Type.STRING },
          value: { type: Type.STRING },
          unit: { type: Type.STRING },
          referenceRange: { type: Type.STRING },
          interpretation: { 
            type: Type.STRING,
            enum: ["Normal", "Leve", "Moderado", "Grave"]
          },
          briefNote: { type: Type.STRING }
        },
        required: ["parameter", "value", "unit", "referenceRange", "interpretation", "briefNote"]
      }
    },
    medicalInterpretation: { type: Type.STRING },
    alertLevel: { 
      type: Type.STRING,
      enum: ["Normal", "Seguimiento", "Revisión médica recomendada"]
    },
    analysisDate: { type: Type.STRING, description: "Fecha del análisis encontrada en el documento (ISO 8601 si es posible)" },
    doctorName: { type: Type.STRING, description: "Nombre del médico que firma o solicita el análisis" },
    clinicName: { type: Type.STRING, description: "Nombre del laboratorio o clínica" },
    recommendations: {
      type: Type.OBJECT,
      properties: {
        habits: { type: Type.ARRAY, items: { type: Type.STRING } },
        supplements: { type: Type.ARRAY, items: { type: Type.STRING } },
        specialist: { type: Type.STRING }
      },
      required: ["habits", "supplements", "specialist"]
    },
    missingData: { type: Type.ARRAY, items: { type: Type.STRING } },
    glucoseAnalysis: {
      type: Type.OBJECT,
      properties: {
        timeInRange: { type: Type.STRING },
        averageGlucose: { type: Type.STRING },
        variability: { type: Type.STRING },
        patterns: { type: Type.ARRAY, items: { type: Type.STRING } },
        estimatedHbA1c: { type: Type.STRING },
        insulinFactors: {
          type: Type.OBJECT,
          properties: {
            sensitivitySuggestion: { type: Type.STRING },
            carbRatioNote: { type: Type.STRING },
            warning: { type: Type.STRING }
          }
        }
      }
    }
  },
  required: ["results", "medicalInterpretation", "alertLevel", "recommendations", "missingData"]
};

export async function analyzeBloodTest(
  input: string | { mimeType: string; data: string },
  profile?: UserProfile,
  history?: AnalysisReport[]
): Promise<AnalysisReport> {
  const conditionsStr = profile?.conditions?.length ? profile.conditions.join(', ') : 'General';
  
  // Format history for the prompt
  const historyContext = history?.length 
    ? `\nHISTORIAL PREVIO (para análisis de evolución):\n${history.map(h => {
        const date = h.analysisDate || 'Fecha desconocida';
        const results = h.results.map(r => `${r.parameter}: ${r.value} ${r.unit}`).join(', ');
        return `- [${date}]: ${results}`;
      }).join('\n')}`
    : '';

  const systemInstruction = `Actúa como un médico endocrinólogo clínico experto. 
Contexto del Paciente: Condiciones: ${conditionsStr}. ${profile?.otherConditions ? `Otras: ${profile.otherConditions}.` : ''} Medicación: ${profile?.medications || 'No especificada'}.${historyContext}

INSTRUCCIONES DE EXTRACCIÓN:
1. FECHA: Busca la fecha en la que se realizó el análisis dentro del documento. Es CRÍTICO encontrarla. Si no la encuentras, deja el campo vacío.
2. MÉDICO Y CLÍNICA: Identifica el nombre del doctor y el centro médico/laboratorio.
3. RESULTADOS: Extrae parámetros y clasifica desviaciones.

INSTRUCCIONES DE EVOLUCIÓN:
- Si hay historial previo, COMPARA los resultados actuales con los anteriores.
- En 'medicalInterpretation', menciona si los valores han mejorado, empeorado o se mantienen estables.
- Sé específico: "Tu glucosa ha bajado un 10% respecto al análisis de [fecha]".

INSTRUCCIONES ESPECIALES POR PERFIL:
- PACIENTE BARIÁTRICO (Bariátrica Parcial/Total): Presta especial atención a la absorción de glucosa (picos rápidos y caídas), niveles de Vitamina B12, Hierro, Calcio y Vitamina D. El riesgo de "Dumping Syndrome" es alto.
- DIABETES (Tipo 1/2): Analiza TIR y variabilidad.
- OSTEOPOROSIS: Analiza niveles de Calcio, Fósforo, Vitamina D y marcadores de remodelación ósea si están presentes.

SOBRE LA INSULINA (SOLO ORIENTATIVO):
- NO des dosis exactas.
- Explica los factores que afectan la dosis (sensibilidad a la insulina, ratio de carbohidratos).
- Si el usuario tiene registros diarios, analiza si la dosis actual parece insuficiente o excesiva según las tendencias, pero siempre remite al ajuste médico oficial.

Si es un reporte de glucosa (CGM/LibreLink):
1. Extrae TIR, Promedio, Variabilidad y HbA1c.
2. Identifica patrones.
3. Llena 'glucoseAnalysis' e incluye 'insulinFactors' si el perfil es diabético.

Si es un análisis de sangre:
1. Extrae parámetros y clasifica desviaciones.
2. En bariátricos, prioriza el panel de micronutrientes.

Para todos:
1. Interpretación global adaptada al perfil y a la evolución temporal.
2. Recomendaciones de hábitos y especialistas.
3. ADVERTENCIA: "Los ajustes de insulina deben ser validados por su médico".`;

  const parts = [];
  if (typeof input === "string") {
    parts.push({ text: input });
  } else {
    parts.push({ inlineData: input });
    const fileType = input.mimeType.includes('pdf') ? 'documento PDF' : 'imagen';
    parts.push({ text: `Analiza este ${fileType} de resultados de laboratorio.` });
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: ANALYSIS_SCHEMA,
      },
    });

    if (!response.text) {
      throw new Error("El modelo no devolvió ninguna respuesta.");
    }

    return JSON.parse(response.text.trim());
  } catch (error) {
    console.error("Gemini API Error:", error);
    if (error instanceof Error) {
      if (error.message.includes("safety")) {
        throw new Error("El contenido fue bloqueado por filtros de seguridad. Asegúrate de subir resultados médicos válidos.");
      }
      throw error;
    }
    throw new Error("Error desconocido al procesar con IA.");
  }
}
