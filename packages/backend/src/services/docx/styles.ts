/**
 * GB/T 9704 style constants for official documents.
 * See .cursor/rules/300-gov-doc-formatter.mdc
 */
export const GOV_DOC_STYLES = {
  /** Title font: 方正小标宋简体 */
  titleFont: '方正小标宋简体',
  /** Body font: 仿宋_GB2312 */
  bodyFont: '仿宋_GB2312',
  /** Body size: 32 (三号字, 16pt) */
  bodySize: 32,
  /** Line spacing: 560 (28pt, docx 1/20 unit) */
  lineSpacing: 560,
  /** First line indent (2 chars), twips */
  firstLineIndent: 640,
  /** Page margins in cm (GB/T 9704) */
  marginTop: '3.7cm',
  marginBottom: '3.5cm',
  marginLeft: '2.8cm',
  marginRight: '2.6cm',
} as const;
