import { invoke } from '@tauri-apps/api/core';
invoke('get_license_state').then(console.log).catch(console.error);
