import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogError } from './catalog-error';
import { previewReplyHint } from './preview-reply-hint';

test('a completed handoff gives a restart action, never the initial start instruction', () => {
  for (const language of ['ar', 'en']) {
    const initial = previewReplyHint('', false, language);
    const handoff = previewReplyHint('handed_off', false, language);
    assert.notEqual(handoff, initial);
    assert.match(handoff, language === 'ar' ? /أعد البدء/ : /restart/);
    assert.notEqual(previewReplyHint('ended', false, language), initial);
    assert.notEqual(previewReplyHint('error', false, language), initial);
    assert.notEqual(previewReplyHint('waiting', true, language), initial);
  }
});

test('malformed Excel feedback explains recovery in the selected language', () => {
  const error = 'Cannot import workbook: Invalid XLSX archive';
  assert.match(catalogError(error, 'ar'), /احفظ نسخة جديدة/);
  assert.match(catalogError(error, 'en'), /save a new copy/);
  assert.equal(catalogError('Permission denied', 'ar'), 'Permission denied');
});
