import { createClient } from '@supabase/supabase-js';

export const SUPA_URL = 'https://kuyrdptpvksisrmpfnjg.supabase.co';
export const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eXJkcHRwdmtzaXNybXBmbmpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMzI5OTEsImV4cCI6MjA4NzYwODk5MX0.2EFDCdMn9Icg66YmpYTfXHu1D39Bg71u33zRfNwq4_Q';
export const supa = createClient(SUPA_URL, SUPA_KEY);
