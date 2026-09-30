import { expect, test } from 'vitest';
import { Harness } from '../../src/lab/harness';

test('anyone on the floor can flag an issue with photos; only managers review it', () => {
  const h = new Harness();
  const a = h.receive('J-214', 'Oak splits');
  const b = h.receive('J-214', 'Hickory splits');
  const photo = h.cmd(h.users.operator, 'add_photo', { attachment_id: 'ph-1', data_url: 'data:image/jpeg;base64,AAAA', thumb_url: 'data:image/jpeg;base64,AA', media_type: 'image/jpeg', bytes: 3 }, h.db.pallets[a.id]);
  expect(photo.ok).toBe(true);
  const report = h.cmd(h.users.operator, 'report_issue', { issue_kind: 'DAMAGED', description: 'Forklift punctured the wrap', pallet_ids: [a.id, b.id], attachment_ids: ['ph-1'] });
  expect(report.ok).toBe(true);
  if (!report.ok) throw Error();
  const issue = h.db.issues[report.target_id!];
  expect(issue).toMatchObject({ status: 'NEW', kind: 'DAMAGED', pallet_codes: [a.code, b.code], attachment_ids: ['ph-1'], reported_by: h.users.operator });
  expect(issue.reporter_name).not.toBe('');

  // A photo that isn't on one of the report's pallets is refused.
  const stray = h.cmd(h.users.operator, 'report_issue', { issue_kind: 'OTHER', description: 'x', pallet_ids: [b.id], attachment_ids: ['ph-1'] });
  expect(stray.ok).toBe(false);
  expect(h.cmd(h.users.operator, 'report_issue', { issue_kind: 'OTHER', description: '  ', pallet_ids: [b.id] }).ok).toBe(false);

  expect(h.cmd(h.users.operator, 'update_issue', { issue_id: issue.id, status: 'APPROVED' }).ok).toBe(false);
  expect(h.cmd(h.users.supervisor, 'update_issue', { issue_id: issue.id, status: 'APPROVED' }).ok).toBe(true);
  const filed = h.cmd(h.users.supervisor, 'update_issue', { issue_id: issue.id, status: 'FILED', note: 'Claim sent' });
  expect(filed.ok).toBe(true);
  expect(h.db.issues[issue.id]).toMatchObject({ status: 'FILED', review_note: 'Claim sent', reviewed_by: h.users.supervisor });
  expect(h.db.issues[issue.id].reviewer_name).not.toBe('');
});
