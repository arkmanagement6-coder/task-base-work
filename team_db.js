// KRV Management - Team Leader Module Database Layer
// Bridges Supabase Cloud Database and LocalStorage Fallback transparently.

(function() {
  const SUPABASE_URL_DEFAULT = "https://fhrukaegrawsleldnrlw.supabase.co";
  const SUPABASE_KEY_DEFAULT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZocnVrYWVncmF3c2xlbGRucmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NjI0NTksImV4cCI6MjA5NTQzODQ1OX0.5mzjc9ockUTnGhDvY49y6r4M5WNTIBCkyzRdJL0p18E";

  // SHA-256 Hash Function
  const sha256 = async (text) => {
    const msgBuffer = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const getSaltedHash = async (email, password) => {
    const payload = `${email.toLowerCase()}:${password}:KRV-PEPPER-2026-T#9!`;
    return await sha256(payload);
  };

  const signSession = async (user) => {
    if (!user) return "";
    const payload = `${user.id}:${user.email}:${user.role}`;
    return await sha256(payload + ":KRV-SESSION-SECRET-2026!");
  };

  const signUsersList = async (usersList) => {
    const payload = usersList.map(u => `${u.id}:${u.email}:${u.role}:${u.password}`).join("|");
    return await sha256(payload + ":KRV-DATABASE-SECRET-2026!");
  };

  const getSupabaseClient = () => {
    const url = localStorage.getItem("krv-supabase-url") || SUPABASE_URL_DEFAULT;
    const key = localStorage.getItem("krv-supabase-key") || SUPABASE_KEY_DEFAULT;
    if (url && key && window.supabase) {
      try {
        return window.supabase.createClient(url, key);
      } catch (e) {
        console.error("Supabase Client Error: ", e);
      }
    }
    return null;
  };

  // Local Storage Helpers
  const getLocalStorageData = (key, defaultVal = []) => {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultVal;
    } catch (e) {
      console.error(`Error reading localStorage key ${key}:`, e);
      return defaultVal;
    }
  };

  const setLocalStorageData = (key, val) => {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.error(`Error writing localStorage key ${key}:`, e);
    }
  };

  // Main DB Access Object
  const TeamDB = {
    sha256,
    getSaltedHash,
    signSession,
    signUsersList,
    getSupabaseClient,

    // Generic Read
    async get(tableName, localStorageKey, defaultVal = []) {
      const client = getSupabaseClient();
      if (client) {
        try {
          const { data, error } = await client.from(tableName).select("*");
          if (!error && data) {
            // Sync to local storage for caching/offline fallback
            setLocalStorageData(localStorageKey, data);
            return data;
          }
          // If relation does not exist error (42P01), fall back to local storage
          if (error && error.code === '42P01') {
            console.warn(`Supabase table "${tableName}" not found (42P01). Falling back to LocalStorage.`);
          } else if (error) {
            console.error(`Supabase read error on "${tableName}":`, error);
          }
        } catch (e) {
          console.error(`Supabase query exception on "${tableName}":`, e);
        }
      }
      return getLocalStorageData(localStorageKey, defaultVal);
    },

    // Generic Upsert
    async upsert(tableName, localStorageKey, recordOrRecords) {
      const records = Array.isArray(recordOrRecords) ? recordOrRecords : [recordOrRecords];
      const client = getSupabaseClient();
      let cloudSuccess = false;

      if (client) {
        try {
          const { error } = await client.from(tableName).upsert(records);
          if (!error) {
            cloudSuccess = true;
          } else {
            console.warn(`Supabase upsert failed on "${tableName}":`, error);
          }
        } catch (e) {
          console.error(`Supabase upsert exception on "${tableName}":`, e);
        }
      }

      // Always write to local storage
      const localData = getLocalStorageData(localStorageKey, []);
      records.forEach(newRec => {
        const idx = localData.findIndex(r => r.id === newRec.id);
        if (idx > -1) {
          localData[idx] = { ...localData[idx], ...newRec };
        } else {
          localData.push(newRec);
        }
      });
      setLocalStorageData(localStorageKey, localData);

      // If we are updating users table, sync the checksum
      if (localStorageKey === 'krv-users') {
        const check = await signUsersList(localData);
        localStorage.setItem("krv-users-checksum", check);
      }

      return { success: true, cloud: cloudSuccess };
    },

    // Generic Delete
    async delete(tableName, localStorageKey, id, keyField = 'id') {
      const client = getSupabaseClient();
      let cloudSuccess = false;

      if (client) {
        try {
          const { error } = await client.from(tableName).delete().eq(keyField, id);
          if (!error) {
            cloudSuccess = true;
          } else {
            console.warn(`Supabase delete failed on "${tableName}":`, error);
          }
        } catch (e) {
          console.error(`Supabase delete exception on "${tableName}":`, e);
        }
      }

      const localData = getLocalStorageData(localStorageKey, []);
      const updated = localData.filter(r => r[keyField] !== id);
      setLocalStorageData(localStorageKey, updated);

      if (localStorageKey === 'krv-users') {
        const check = await signUsersList(updated);
        localStorage.setItem("krv-users-checksum", check);
      }

      return { success: true, cloud: cloudSuccess };
    },

    // --- Specific Collection Wrappers ---

    // 1. Users (krv_users / krv-users)
    async getUsers() {
      // Default users seed
      const defaults = [
        { id: "admin", name: "KRV System Admin", email: "admin@krv.com", password: "d521ef4a952f07f31cafa3476ee0cc430a2a375c7eb7356034b24bb0c5a37310", mobile: "9876543210", role: "admin" },
        { id: "c1", name: "Rahul Sharma", email: "rahul@gmail.com", password: "d029b6414b8d45715252d8c1f4061b2b193dd8070a8b5711c610e4380a9c2f8b", mobile: "9988776655", city: "Mumbai", pincode: "400001", referral_code: "KRV500", wallet_balance: 750, earnings_pending: 120, earnings_paid: 2500, kyc_status: "Approved", role: "candidate" },
        { id: "c2", name: "Priya Patel", email: "priya@gmail.com", password: "6d0877c1f0b6fce330bfad96b5856d8494191efbb44a3f1b54aae81084b9b27d", mobile: "9876123450", city: "Ahmedabad", pincode: "380001", referral_code: "", wallet_balance: 0, earnings_pending: 250, earnings_paid: 0, kyc_status: "Pending", role: "candidate" },
        { id: "c3", name: "Amit Verma", email: "amit@gmail.com", password: "778013965465006af1ea60778cd1b5420bf020732605a200357cafdd4b56554b", mobile: "8877665544", city: "Delhi", pincode: "110001", referral_code: "REF99", wallet_balance: 50, earnings_pending: 0, earnings_paid: 300, kyc_status: "Rejected", role: "candidate" }
      ];
      return this.get("krv_users", "krv-users", defaults);
    },
    async saveUser(user) {
      return this.upsert("krv_users", "krv-users", user);
    },
    async deleteUser(userId) {
      return this.delete("krv_users", "krv-users", userId);
    },

    // 2. Team Leaders
    async getTeamLeaders() {
      return this.get("team_leaders", "krv-team-leaders", []);
    },
    async saveTeamLeader(tl) {
      return this.upsert("team_leaders", "krv-team-leaders", tl);
    },
    async deleteTeamLeader(tlId) {
      return this.delete("team_leaders", "krv-team-leaders", tlId);
    },

    // 3. Team Assignments
    async getAssignments() {
      return this.get("team_assignments", "krv-team-assignments", []);
    },
    async saveAssignment(assignment) {
      return this.upsert("team_assignments", "krv-team-assignments", assignment);
    },
    async deleteAssignment(id) {
      return this.delete("team_assignments", "krv-team-assignments", id);
    },

    // 4. Team Referrals
    async getReferrals() {
      return this.get("team_referrals", "krv-team-referrals", []);
    },
    async saveReferral(referral) {
      return this.upsert("team_referrals", "krv-team-referrals", referral);
    },

    // 5. Team Activities
    async getActivities() {
      return this.get("team_activities", "krv-team-activities", []);
    },
    async logActivity(activity) {
      const newAct = {
        id: "act_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
        login_time: new Date().toISOString(),
        last_active: new Date().toISOString(),
        ...activity
      };
      return this.upsert("team_activities", "krv-team-activities", newAct);
    },

    // 6. Team Messages
    async getMessages() {
      return this.get("team_messages", "krv-team-messages", []);
    },
    async saveMessage(msg) {
      const newMsg = {
        id: "msg_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
        created_at: new Date().toISOString(),
        ...msg
      };
      return this.upsert("team_messages", "krv-team-messages", newMsg);
    },

    // 7. Team Notifications
    async getNotifications() {
      return this.get("team_notifications", "krv-team-notifications", []);
    },
    async saveNotification(notif) {
      const newNotif = {
        id: "notif_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
        created_at: new Date().toISOString(),
        is_read: false,
        ...notif
      };
      return this.upsert("team_notifications", "krv-team-notifications", newNotif);
    },

    // 8. Team Performance
    async getPerformance() {
      return this.get("team_performance", "krv-team-performance", []);
    },
    async savePerformance(perf) {
      return this.upsert("team_performance", "krv-team-performance", perf);
    },

    // 9. Team Incentives
    async getIncentives() {
      return this.get("team_incentives", "krv-team-incentives", []);
    },
    async saveIncentive(inc) {
      const newInc = {
        id: "inc_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
        created_at: new Date().toISOString().split('T')[0],
        status: "Pending",
        ...inc
      };
      return this.upsert("team_incentives", "krv-team-incentives", newInc);
    },

    // 10. Team Incentive Rules
    async getIncentiveRules() {
      const defaultRules = [
        { id: "rule_1", rule_name: "Active Recruiter", description: "Earn ₹100 for each candidate who submits at least 3 approved reviews.", min_tasks: 3, bonus_amount: 100, active: true },
        { id: "rule_2", rule_name: "Performance Milestone", description: "Earn ₹500 if your team maintains a 90%+ approval rate and completes 10+ total tasks.", min_tasks: 10, bonus_amount: 500, active: true }
      ];
      return this.get("team_incentive_rules", "krv-team-incentive-rules", defaultRules);
    },
    async saveIncentiveRule(rule) {
      return this.upsert("team_incentive_rules", "krv-team-incentive-rules", rule);
    },

    // Dynamic connection check
    async checkCloudStatus() {
      const client = getSupabaseClient();
      if (!client) return false;
      try {
        const { data, error } = await client.from("team_leaders").select("id").limit(1);
        if (error) {
          console.warn("Supabase connection check error:", error);
          return false;
        }
        return true;
      } catch (e) {
        console.warn("Supabase connection check exception:", e);
        return false;
      }
    },

    // Seeding function (run on startup)
    async init() {
      // 1. Ensure users database is loaded
      const users = await this.getUsers();
      
      // 2. Check if a default Team Leader exists
      const hasTL = users.some(u => u.role === 'team_leader');
      if (!hasTL) {
        console.log("Seeding demo team leader account (tl1@krv.com / 123456)...");
        const tlPasswordHash = await getSaltedHash("tl1@krv.com", "123456");
        
        const newTlUser = {
          id: "tl1",
          name: "Vikram Singh (Demo TL)",
          email: "tl1@krv.com",
          password: tlPasswordHash,
          mobile: "9876543210",
          role: "team_leader",
          status: "Active",
          kyc_status: "Approved",
          created_at: new Date().toISOString().split('T')[0]
        };

        const newTlProfile = {
          id: "tl1",
          user_id: "tl1",
          tl_code: "TL001",
          joining_date: new Date().toISOString().split('T')[0],
          status: "Active"
        };

        await this.saveUser(newTlUser);
        await this.saveTeamLeader(newTlProfile);

        // Also assign candidate c1 and c2 to this Team Leader for demo purposes!
        const assignments = await this.getAssignments();
        if (assignments.length === 0) {
          await this.saveAssignment({ id: "asg_c1", tl_id: "tl1", candidate_id: "c1", assigned_at: new Date().toISOString().split('T')[0] });
          await this.saveAssignment({ id: "asg_c2", tl_id: "tl1", candidate_id: "c2", assigned_at: new Date().toISOString().split('T')[0] });
        }

        // Also log activity
        await this.logActivity({ user_id: "tl1", action: "TEAM_CREATION", details: "Team Vikram Singh (TL001) initialized." });
      }
    }
  };

  // Expose to window
  window.TeamDB = TeamDB;

  // Initialize async seeding
  TeamDB.init().catch(err => console.error("TeamDB Init Error:", err));
})();
