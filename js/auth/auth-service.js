window.CR = window.CR || {};

(() => {
  const CR = window.CR;

  async function getSession() {
    const supabase = await CR.getSupabase();
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    return data?.session || null;
  }

  async function requestOtp(email) {
    const supabase = await CR.getSupabase();

    return await supabase.auth.signInWithOtp({
      email
    });
  }

  async function verifyOtp(email, token) {
    const supabase = await CR.getSupabase();

    return await supabase.auth.verifyOtp({
      email,
      token,
      type: 'email'
    });
  }

  async function signOut() {
    const supabase = await CR.getSupabase();
    return await supabase.auth.signOut();
  }

  async function loadProfile(user) {
    if (!user?.id) return null;

    const supabase = await CR.getSupabase();

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;

    return data || null;
  }

  function sortActiveProfiles(profiles = []) {
    return profiles.slice().sort((a, b) => {
      const aSlot = Number(a.rivalry_slot || a.rivalrySlot || 99);
      const bSlot = Number(b.rivalry_slot || b.rivalrySlot || 99);

      if (aSlot !== bSlot) return aSlot - bSlot;

      const aName = String(a.display_name || a.username || '').trim().toLowerCase();
      const bName = String(b.display_name || b.username || '').trim().toLowerCase();

      return aName.localeCompare(bName);
    });
  }

  async function loadActiveProfiles() {
    const supabase = await CR.getSupabase();

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('is_active', true);

    if (error) throw error;

    return sortActiveProfiles(data || []);
  }

  async function isAllowedUser() {
    const supabase = await CR.getSupabase();

    const { data, error } = await supabase.rpc('is_allowed_user');

    if (error) throw error;

    return data === true;
  }

  CR.auth = {
    getSession,
    requestOtp,
    verifyOtp,
    signOut,
    loadProfile,
    loadActiveProfiles,
    isAllowedUser
  };
})();
