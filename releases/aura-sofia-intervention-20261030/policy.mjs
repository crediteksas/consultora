export const OLD_GUARD="if(previous&&previous===current&&minutes<=30){reasons.push('Sofía repitió una pregunta');break;}";
export const NEW_GUARD="if(previous&&previous===current&&minutes<=30&&isConversationQuestion(outgoing[i].contenido)){reasons.push('Sofía repitió una pregunta');break;}";
export const QUESTION_HELPER=`function isConversationQuestion(value){
  const text=String(value||'');
  return /[?¿]/.test(text)||/^(?:me (?:confirmas|regalas|indicas|compartes|dices|envias)|(?:puedes|podrias) (?:confirmar|compartir|indicar|enviar|decir|regalar)(?:me)?|cual(?:es)? (?:es|son)|en que (?:ciudad|municipio)|a que (?:celular|numero)|que (?:marca|modelo|equipo))(?:\\s|$)/.test(normalizeConversationText(text));
}
`;
export function patchQuestionAlert(html){
  const anchor='function interventionReasons(messages,client){';
  if(html.split(OLD_GUARD).length!==2||html.split(anchor).length!==2) return null;
  return html.replace(anchor,QUESTION_HELPER+anchor).replace(OLD_GUARD,NEW_GUARD);
}
