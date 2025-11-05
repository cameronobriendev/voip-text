import { hashPassword } from '../api/auth/utils.js';

async function updatePassword() {
  const newPassword = 'jbMlQU75Ysuh3VUtzwkypQRKmC53zuGB';
  const hash = await hashPassword(newPassword);
  console.log(hash);
}

updatePassword().catch(console.error);
