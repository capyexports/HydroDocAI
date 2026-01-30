/**
 * GB/T 9704 compliant .docx export for water administration documents.
 * See .cursor/rules/300-gov-doc-formatter.mdc
 */
import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  SectionType,
  TextRun,
} from 'docx';
import type { WaterDocumentState } from '@hydrodocai/shared';
import { GOV_DOC_STYLES } from './styles.js';

// Page margins in twips (GB/T 9704): top 3.7cm, bottom 3.5cm, left 2.8cm, right 2.6cm
const PAGE_MARGIN_TWIPS = {
  top: 2098,
  bottom: 1984,
  left: 1587,
  right: 1474,
};

function formatCitationLine(citation: { title: string; articleNumber?: number; articleText: string }): string {
  const num = citation.articleNumber != null ? citation.articleNumber : 'X';
  return `根据${citation.title}第${num}条之规定：“${citation.articleText}”`;
}

/**
 * Build document sections from state: title, body paragraphs, legal citations, date, and signature block.
 */
function buildBody(state: WaterDocumentState): Paragraph[] {
  const bodyFont = GOV_DOC_STYLES.bodyFont;
  const bodySize = GOV_DOC_STYLES.bodySize;
  const lineSpacing = GOV_DOC_STYLES.lineSpacing;
  const firstLineIndent = GOV_DOC_STYLES.firstLineIndent;

  const paragraphs: Paragraph[] = [];

  // Title (方正小标宋简体, centered)
  const docType = state.documentType ?? '限期缴纳通知书';
  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: docType,
          font: GOV_DOC_STYLES.titleFont,
          size: bodySize,
        }),
      ],
      spacing: { line: lineSpacing },
    })
  );

  // Blank line after title
  paragraphs.push(
    new Paragraph({
      children: [],
      spacing: { line: lineSpacing },
    })
  );

  // Main content: split documentContent by newlines into paragraphs with first-line indent
  const content = state.documentContent?.trim() || '';
  for (const line of content.split(/\r?\n/)) {
    if (line.trim() === '') {
      paragraphs.push(new Paragraph({ children: [], spacing: { line: lineSpacing } }));
      continue;
    }
    paragraphs.push(
      new Paragraph({
        indent: { firstLine: firstLineIndent },
        spacing: { line: lineSpacing },
        children: [
          new TextRun({
            text: line,
            font: bodyFont,
            size: bodySize,
          }),
        ],
      })
    );
  }

  // Legal citations if any
  const citations = state.legalCitations ?? [];
  if (citations.length > 0) {
    paragraphs.push(new Paragraph({ children: [], spacing: { line: lineSpacing } }));
    for (const c of citations) {
      paragraphs.push(
        new Paragraph({
          indent: { firstLine: firstLineIndent },
          spacing: { line: lineSpacing },
          children: [
            new TextRun({
              text: formatCitationLine(c),
              font: bodyFont,
              size: bodySize,
            }),
          ],
        })
      );
    }
  }

  // Date: Arabic numerals, e.g. 2026年1月28日
  const now = new Date();
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
  paragraphs.push(new Paragraph({ children: [], spacing: { line: lineSpacing } }));
  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { line: lineSpacing },
      children: [
        new TextRun({
          text: dateStr,
          font: bodyFont,
          size: bodySize,
        }),
      ],
    })
  );

  // Signature block: right-aligned with right margin (4 chars space per rule)
  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      indent: { right: 640 },
      spacing: { line: lineSpacing },
      children: [
        new TextRun({
          text: '（落款单位）',
          font: bodyFont,
          size: bodySize,
        }),
      ],
    })
  );

  return paragraphs;
}

/**
 * Export state to a GB/T 9704 compliant .docx buffer.
 */
export async function exportToDocx(state: WaterDocumentState): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        properties: {
          type: SectionType.CONTINUOUS,
          page: {
            margin: PAGE_MARGIN_TWIPS,
          },
        },
        children: buildBody(state),
      },
    ],
  });

  return Packer.toBuffer(doc);
}
