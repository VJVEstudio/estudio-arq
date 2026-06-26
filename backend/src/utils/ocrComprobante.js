async function leerComprobante(buffer, mimeType) {
  const base64Data = buffer.toString('base64');

  const esPdf = mimeType === 'application/pdf';
  const contenido = esPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } }
    : { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } };

  const prompt = `Analizá esta factura o recibo y extraé los siguientes datos en formato JSON, sin texto adicional, sin explicaciones, solo el JSON:

{
  "proveedor": "nombre de la empresa o persona que emite el comprobante",
  "descripcion": "breve descripción del concepto facturado",
  "numero_comprobante": "número de factura o comprobante, formato tipo A0001-00001234",
  "fecha": "fecha del comprobante en formato YYYY-MM-DD",
  "moneda": "ARS o USD",
  "monto_neto": número (monto neto sin impuestos, solo el número, sin símbolos),
  "iva": número (monto de IVA discriminado, 0 si no aplica),
  "iibb": número (monto de IIBB u otras retenciones/percepciones discriminadas, 0 si no aplica),
  "monto_total": número (total final con impuestos incluidos)
}

Si no podés determinar algún campo con certeza, usá null para texto o 0 para números. Respondé ÚNICAMENTE con el JSON, sin marcadores de código ni texto adicional.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            contenido,
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Error de la API de Claude:', errText);
    throw new Error('No se pudo procesar el comprobante con OCR');
  }

  const data = await response.json();
  const textoRespuesta = data.content.find(b => b.type === 'text')?.text || '{}';

  // Limpiar posibles marcadores de código si vinieran
  const textoLimpio = textoRespuesta.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(textoLimpio);
  } catch (err) {
    console.error('Error parseando respuesta de OCR:', textoRespuesta);
    throw new Error('La respuesta del OCR no tiene un formato válido');
  }
}

module.exports = { leerComprobante };
