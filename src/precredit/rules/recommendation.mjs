export const recommendationForSignal=signal=>signal==='GREEN'?'Puede continuar a evaluación':signal==='RED'?'NO AUTORIZAR SIN REVISIÓN':'Revisión requerida';
