import { getBrowserApi } from './browserApi.js';

const api = getBrowserApi();
const status = document.querySelector('#status');
status.textContent = 'Popup scaffold loaded.';
void api;
