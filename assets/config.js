// Public settings for the browser. Both values are safe to publish:
// the anon key only allows what the database's row-level security rules allow.
// Fill these in from Supabase → Project Settings → API.
export const CONFIG = {
  supabaseUrl: "https://anocsduoslcucsbnjrwa.supabase.co",      // e.g. "https://abcd1234.supabase.co"
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFub2NzZHVvc2xjdWNzYm5qcndhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ1NzIwMTMsImV4cCI6MjExMDE0ODAxM30.D5Ja2K39m-RfBfK8oO0S5bTCJWDQ51fdndSzHr_beQs",  // the "anon" / publishable key
  companyDomain: "homeslystays.com",
};
