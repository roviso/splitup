import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseContacts } from './contacts';

test('vcard: FN, folded lines, item-prefixed fields, skips contacts without email/phone', () => {
  const vcf = 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Sita Sharma\r\nitem1.TEL;type=CELL:+977 984-1000000\r\nEND:VCARD\r\n' +
    'BEGIN:VCARD\nN:Thapa;Hari;;;\nEMAIL;TYPE=INTERNET:Hari@Mail.com\nEND:VCARD\nBEGIN:VCARD\nFN:No Number\nEND:VCARD\n';
  assert.deepEqual(parseContacts(vcf), [
    { name: 'Sita Sharma', email: undefined, phone: '+9779841000000' },
    { name: 'Hari Thapa', email: 'hari@mail.com', phone: undefined },
  ]);
});

test('csv: google export columns, quoted commas, duplicates dropped', () => {
  const csv = 'First Name,Last Name,E-mail 1 - Value,Phone 1 - Value\n"Ram, Jr",KC,ram@x.np,98410 00001 ::: 98000\nRam,KC,ram@x.np,\n';
  assert.deepEqual(parseContacts(csv), [{ name: 'Ram, Jr KC', email: 'ram@x.np', phone: '9841000001' }]);
});
