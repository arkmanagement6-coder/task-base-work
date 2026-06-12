// KRV Management - Team Leader Module Admin Panel Components
// Developed as an extension module. Shared via window namespace.

(function() {
  const { useState, useEffect, useMemo, useRef } = React;

  // Custom Icon Component matching existing admin system
  const Icon = ({ name, className = "w-5 h-5", ...props }) => {
    if (window.Icon) return React.createElement(window.Icon, { name, className, ...props });
    // Fallback if not globally loaded
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      </svg>
    );
  };

  // 1. ALL TEAM LEADERS COMPONENT
  function AdminTeamLeaders({
    users, setUsers,
    teamLeaders, setTeamLeaders,
    teamAssignments, setTeamAssignments,
    triggerToast
  }) {
    const [searchTerm, setSearchTerm] = useState("");
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [showAssignModal, setShowAssignModal] = useState(false);

    const [selectedTL, setSelectedTL] = useState(null);
    const [formData, setFormData] = useState({ name: "", email: "", mobile: "", password: "", tl_code: "" });
    const [newPassword, setNewPassword] = useState("");
    const [selectedCandidates, setSelectedCandidates] = useState([]);
    const [assignSearchTerm, setAssignSearchTerm] = useState("");
    const [dbMode, setDbMode] = useState("checking"); // 'checking' | 'live' | 'local'

    useEffect(() => {
      let isMounted = true;
      const checkStatus = async () => {
        if (window.TeamDB && typeof window.TeamDB.checkCloudStatus === 'function') {
          const isLive = await window.TeamDB.checkCloudStatus();
          if (isMounted) {
            setDbMode(isLive ? "live" : "local");
          }
        } else {
          // Retry checking status after a delay
          setTimeout(checkStatus, 500);
        }
      };
      checkStatus();
      return () => { isMounted = false; };
    }, []);

    // Stats calculations
    const stats = useMemo(() => {
      const activeTLs = teamLeaders.filter(t => t.status === "Active").length;
      const inactiveTLs = teamLeaders.filter(t => t.status === "Inactive").length;
      const totalMembers = teamAssignments.length;
      
      // Calculate active team members based on their krv_users status
      const assignedCandIds = teamAssignments.map(a => a.candidate_id);
      const activeMembers = users.filter(u => assignedCandIds.includes(u.id) && u.status === "Active").length;
      const inactiveMembers = users.filter(u => assignedCandIds.includes(u.id) && u.status === "Inactive").length;

      return {
        totalTLs: teamLeaders.length,
        activeTLs,
        inactiveTLs,
        totalMembers,
        activeMembers,
        inactiveMembers
      };
    }, [teamLeaders, teamAssignments, users]);

    // Filtered Team Leaders
    const filteredTLs = useMemo(() => {
      return teamLeaders.filter(tl => {
        const userDetails = users.find(u => u.id === tl.user_id) || {};
        const matchesSearch = 
          (userDetails.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (userDetails.email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (tl.tl_code || "").toLowerCase().includes(searchTerm.toLowerCase());
        return matchesSearch;
      });
    }, [teamLeaders, users, searchTerm]);

    // Handle Create TL
    const handleCreateTL = async (e) => {
      e.preventDefault();
      if (!formData.name || !formData.email || !formData.mobile || !formData.password || !formData.tl_code) {
        triggerToast("Please fill all required fields.", "error");
        return;
      }

      // Check if email already exists
      if (users.some(u => u.email.toLowerCase() === formData.email.toLowerCase())) {
        triggerToast("Email address already exists.", "error");
        return;
      }

      // Check if TL code already exists
      if (teamLeaders.some(t => t.tl_code.toUpperCase() === formData.tl_code.toUpperCase())) {
        triggerToast("Team Leader Code already exists.", "error");
        return;
      }

      try {
        const hashedPassword = await window.TeamDB.getSaltedHash(formData.email, formData.password);
        const newUserId = "tl_" + Date.now();

        const newUser = {
          id: newUserId,
          name: formData.name,
          email: formData.email,
          password: hashedPassword,
          mobile: formData.mobile,
          role: "team_leader",
          status: "Active",
          kyc_status: "Approved",
          created_at: new Date().toISOString().split('T')[0]
        };

        const newTLProfile = {
          id: "tlp_" + Date.now(),
          user_id: newUserId,
          tl_code: formData.tl_code.toUpperCase(),
          joining_date: new Date().toISOString().split('T')[0],
          status: "Active"
        };

        // Save to DB
        await window.TeamDB.saveUser(newUser);
        await window.TeamDB.saveTeamLeader(newTLProfile);

        // Update state
        setUsers(prev => [...prev, newUser]);
        setTeamLeaders(prev => [...prev, newTLProfile]);

        // Log Activity
        await window.TeamDB.logActivity({
          user_id: newUserId,
          action: "TEAM_CREATION",
          details: `Team Leader ${formData.name} (${newTLProfile.tl_code}) registered.`
        });

        triggerToast("Team Leader created successfully!");
        setShowCreateModal(false);
        setFormData({ name: "", email: "", mobile: "", password: "", tl_code: "" });
      } catch (err) {
        console.error("Create TL error:", err);
        triggerToast("Error creating Team Leader.", "error");
      }
    };

    // Handle Edit TL
    const handleEditTL = async (e) => {
      e.preventDefault();
      if (!selectedTL || !formData.name || !formData.mobile) {
        triggerToast("Please fill Name and Mobile fields.", "error");
        return;
      }

      try {
        const tlUser = users.find(u => u.id === selectedTL.user_id);
        if (!tlUser) return;

        const updatedUser = { ...tlUser, name: formData.name, mobile: formData.mobile };
        await window.TeamDB.saveUser(updatedUser);

        // Update state
        setUsers(prev => prev.map(u => u.id === tlUser.id ? updatedUser : u));

        triggerToast("Team Leader updated successfully!");
        setShowEditModal(false);
        setSelectedTL(null);
      } catch (err) {
        console.error("Edit TL error:", err);
        triggerToast("Error updating Team Leader.", "error");
      }
    };

    // Toggle Active Status
    const toggleStatus = async (tl) => {
      try {
        const nextStatus = tl.status === "Active" ? "Inactive" : "Active";
        const updatedTL = { ...tl, status: nextStatus };
        
        const tlUser = users.find(u => u.id === tl.user_id);
        if (tlUser) {
          const updatedUser = { ...tlUser, status: nextStatus };
          await window.TeamDB.saveUser(updatedUser);
          setUsers(prev => prev.map(u => u.id === tlUser.id ? updatedUser : u));
        }

        await window.TeamDB.saveTeamLeader(updatedTL);
        setTeamLeaders(prev => prev.map(t => t.id === tl.id ? updatedTL : t));

        await window.TeamDB.logActivity({
          user_id: tl.user_id,
          action: nextStatus === "Active" ? "TL_ACTIVATION" : "TL_DEACTIVATION",
          details: `Team Leader ${tlUser?.name || tl.user_id} was ${nextStatus.toLowerCase()}d.`
        });

        triggerToast(`Team Leader status updated to ${nextStatus}.`);
      } catch (err) {
        console.error("Toggle status error:", err);
        triggerToast("Error updating status.", "error");
      }
    };

    // Toggle Block Status
    const toggleBlock = async (tl) => {
      try {
        const isBlocked = tl.status === "Blocked";
        const nextStatus = isBlocked ? "Active" : "Blocked";
        const updatedTL = { ...tl, status: nextStatus };
        
        const tlUser = users.find(u => u.id === tl.user_id);
        if (tlUser) {
          const updatedUser = { ...tlUser, status: nextStatus };
          await window.TeamDB.saveUser(updatedUser);
          setUsers(prev => prev.map(u => u.id === tlUser.id ? updatedUser : u));
        }

        await window.TeamDB.saveTeamLeader(updatedTL);
        setTeamLeaders(prev => prev.map(t => t.id === tl.id ? updatedTL : t));

        await window.TeamDB.logActivity({
          user_id: tl.user_id,
          action: isBlocked ? "TL_UNBLOCK" : "TL_BLOCK",
          details: `Team Leader ${tlUser?.name || tl.user_id} was ${isBlocked ? "unblocked" : "blocked"}.`
        });

        triggerToast(`Team Leader ${isBlocked ? "unblocked" : "blocked"} successfully!`);
      } catch (err) {
        console.error("Toggle block error:", err);
        triggerToast("Error updating block status.", "error");
      }
    };

    // Permanently Delete Team Leader
    const handleDeleteTL = async (tl) => {
      const tlUser = users.find(u => u.id === tl.user_id);
      if (!window.confirm(`Are you sure you want to permanently delete Team Leader "${tlUser?.name || tl.user_id}"? This will remove all their candidates assignments and referrals.`)) return;

      try {
        // 1. Delete assignments
        const tlAssignments = teamAssignments.filter(a => a.tl_id === tl.user_id);
        for (const asg of tlAssignments) {
          await window.TeamDB.deleteAssignment(asg.id);
        }

        // 2. Delete team leader profile
        await window.TeamDB.deleteTeamLeader(tl.id);

        // 3. Delete user
        await window.TeamDB.deleteUser(tl.user_id);

        // 4. Update parent states
        setTeamLeaders(prev => prev.filter(t => t.id !== tl.id));
        setUsers(prev => prev.filter(u => u.id !== tl.user_id));
        setTeamAssignments(prev => prev.filter(a => a.tl_id !== tl.user_id));

        // 5. Log Activity
        await window.TeamDB.logActivity({
          user_id: tl.user_id,
          action: "TEAM_DELETION",
          details: `Team Leader ${tlUser?.name || tl.user_id} was permanently deleted.`
        });

        triggerToast("Team Leader deleted successfully!");
      } catch (err) {
        console.error("Delete TL error:", err);
        triggerToast("Error deleting Team Leader.", "error");
      }
    };

    // Handle Reset Password
    const handleResetPassword = async (e) => {
      e.preventDefault();
      if (!selectedTL || !newPassword) {
        triggerToast("Please enter a new password.", "error");
        return;
      }

      try {
        const tlUser = users.find(u => u.id === selectedTL.user_id);
        if (!tlUser) return;

        const saltedHash = await window.TeamDB.getSaltedHash(tlUser.email, newPassword);
        const updatedUser = { ...tlUser, password: saltedHash };

        await window.TeamDB.saveUser(updatedUser);
        setUsers(prev => prev.map(u => u.id === tlUser.id ? updatedUser : u));

        triggerToast("Password reset successfully!");
        setShowPasswordModal(false);
        setNewPassword("");
        setSelectedTL(null);
      } catch (err) {
        console.error("Reset password error:", err);
        triggerToast("Error resetting password.", "error");
      }
    };

    // Handle Assign Candidates
    const handleAssignCandidates = async () => {
      if (!selectedTL) return;
      
      try {
        // Find existing assignments for this TL
        const existingAssignments = teamAssignments.filter(a => a.tl_id === selectedTL.user_id);
        const existingCandIds = existingAssignments.map(a => a.candidate_id);

        // Determine added and removed candidates
        const added = selectedCandidates.filter(id => !existingCandIds.includes(id));
        const removed = existingCandIds.filter(id => !selectedCandidates.includes(id));

        // Delete removed assignments
        for (const candId of removed) {
          const asg = existingAssignments.find(a => a.candidate_id === candId);
          if (asg) {
            await window.TeamDB.deleteAssignment(asg.id);
          }
        }

        // Add new assignments
        for (const candId of added) {
          const newAsg = {
            id: "asg_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
            tl_id: selectedTL.user_id,
            candidate_id: candId,
            assigned_at: new Date().toISOString().split('T')[0]
          };
          await window.TeamDB.saveAssignment(newAsg);
        }

        // Refresh state
        const updatedAssignments = await window.TeamDB.getAssignments();
        setTeamAssignments(updatedAssignments);

        // Log Activity
        const tlUser = users.find(u => u.id === selectedTL.user_id);
        await window.TeamDB.logActivity({
          user_id: selectedTL.user_id,
          action: "CANDIDATE_ASSIGNMENT",
          details: `Assigned ${added.length} candidates, removed ${removed.length} candidates for ${tlUser?.name || selectedTL.user_id}.`
        });

        triggerToast(`Team assignments updated!`);
        setShowAssignModal(false);
        setSelectedTL(null);
      } catch (err) {
        console.error("Assign candidates error:", err);
        triggerToast("Error updating assignments.", "error");
      }
    };

    // Unassigned Candidates
    const unassignedCandidates = useMemo(() => {
      const assignedIds = teamAssignments.map(a => a.candidate_id);
      const list = users.filter(u => u.role === "candidate" && !assignedIds.includes(u.id));
      if (!assignSearchTerm.trim()) return list;
      return list.filter(c => 
        (c.name || "").toLowerCase().includes(assignSearchTerm.toLowerCase()) ||
        (c.email || "").toLowerCase().includes(assignSearchTerm.toLowerCase())
      );
    }, [users, teamAssignments, assignSearchTerm]);

    // Team members of the selected TL
    const currentTeamMembers = useMemo(() => {
      if (!selectedTL) return [];
      const assignedIds = teamAssignments
        .filter(a => a.tl_id === selectedTL.user_id)
        .map(a => a.candidate_id);
      return users.filter(u => u.role === "candidate" && assignedIds.includes(u.id));
    }, [selectedTL, teamAssignments, users]);

    return (
      <div className="space-y-6">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-card rounded-2xl p-5 flex flex-col justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Team Leaders</span>
            <span className="text-3xl font-extrabold mt-2 text-white">{stats.totalTLs}</span>
            <div className="text-[10px] text-slate-400 mt-2 flex gap-2">
              <span className="text-emerald-400">{stats.activeTLs} Active</span>
              <span className="text-slate-500">•</span>
              <span className="text-rose-400">{stats.inactiveTLs} Inactive</span>
            </div>
          </div>
          <div className="glass-card rounded-2xl p-5 flex flex-col justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Assigned Members</span>
            <span className="text-3xl font-extrabold mt-2 text-white">{stats.totalMembers}</span>
            <div className="text-[10px] text-slate-400 mt-2 flex gap-2">
              <span className="text-emerald-400">{stats.activeMembers} Active</span>
              <span className="text-slate-500">•</span>
              <span className="text-rose-400">{stats.inactiveMembers} Inactive</span>
            </div>
          </div>
          <div className="glass-card rounded-2xl p-5 flex flex-col justify-between col-span-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Module Operational Status</span>
            {dbMode === "live" && (
              <>
                <span className="text-xl font-extrabold mt-2 text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Live Cloud Mode Active
                </span>
                <span className="text-[10px] text-slate-400 mt-2 block leading-relaxed">
                  Connected to Supabase Cloud Database. Synchronizing collections: team_leaders, team_assignments, team_referrals, team_activities, team_messages, team_notifications, team_performance, team_incentives
                </span>
              </>
            )}
            {dbMode === "local" && (
              <>
                <span className="text-xl font-extrabold mt-2 text-amber-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                  Local Testing Sandbox Active
                </span>
                <span className="text-[10px] text-slate-400 mt-2 block leading-relaxed">
                  Using local browser storage fallback. Supabase connection inactive or tables missing.
                </span>
              </>
            )}
            {dbMode === "checking" && (
              <>
                <span className="text-xl font-extrabold mt-2 text-slate-400 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-500 animate-pulse"></span>
                  Checking Database Status...
                </span>
                <span className="text-[10px] text-slate-400 mt-2 block leading-relaxed">
                  Verifying Supabase cloud database connection...
                </span>
              </>
            )}
          </div>
        </div>

        {/* Filter and Create Controls */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:max-w-md">
            <input
              type="text"
              placeholder="Search Team Leaders by Name, Email, or Code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white/5 focus:outline-none focus:border-blue-500 text-white"
            />
            <Icon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          </div>
          <button
            onClick={() => {
              setFormData({ name: "", email: "", mobile: "", password: "", tl_code: "TL" + String(teamLeaders.length + 1).padStart(3, '0') });
              setShowCreateModal(true);
            }}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md cursor-pointer transition flex items-center justify-center gap-2"
          >
            <Icon name="plus" className="w-4 h-4" /> Create Team Leader
          </button>
        </div>

        {/* Team Leaders Table */}
        <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/5 dark:border-slate-800/40">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 uppercase text-[10px] font-bold tracking-wider">
                  <th className="p-4">TL Code</th>
                  <th className="p-4">Team Leader Name</th>
                  <th className="p-4">Contact Info</th>
                  <th className="p-4">Joined Date</th>
                  <th className="p-4">Team Size</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-xs font-medium">
                {filteredTLs.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-8 text-center text-slate-500">No Team Leaders registered yet. Create one to get started!</td>
                  </tr>
                ) : (
                  filteredTLs.map(tl => {
                    const u = users.find(usr => usr.id === tl.user_id) || {};
                    const teamSize = teamAssignments.filter(a => a.tl_id === tl.user_id).length;

                    return (
                      <tr key={tl.id} className="hover:bg-slate-800/20 text-slate-300">
                        <td className="p-4"><span className="px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-400 font-bold border border-blue-500/20 uppercase">{tl.tl_code}</span></td>
                        <td className="p-4">
                          <span className="font-bold text-white block">{u.name || "N/A"}</span>
                          <span className="text-[10px] text-slate-500 uppercase font-semibold">Joined {tl.joining_date}</span>
                        </td>
                        <td className="p-4">
                          <span className="block text-slate-400">{u.email}</span>
                          <span className="block text-slate-500">{u.mobile}</span>
                        </td>
                        <td className="p-4">{tl.joining_date || "N/A"}</td>
                        <td className="p-4"><span className="font-bold text-white text-sm">{teamSize}</span> members</td>
                        <td className="p-4">
                          <button
                            onClick={() => toggleStatus(tl)}
                            className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase cursor-pointer border transition ${
                              tl.status === "Active"
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
                                : tl.status === "Blocked"
                                ? "bg-red-550/10 border-red-550/20 text-red-500 hover:bg-red-550/20 font-extrabold"
                                : "bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20"
                            }`}
                          >
                            {tl.status}
                          </button>
                        </td>
                        <td className="p-4 text-right space-x-2">
                          <button
                            onClick={() => {
                              setSelectedTL(tl);
                              setFormData({ name: u.name, mobile: u.mobile });
                              setShowEditModal(true);
                            }}
                            title="Edit Profile"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer transition inline-flex items-center"
                          >
                            <Icon name="edit" className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedTL(tl);
                              setNewPassword("");
                              setShowPasswordModal(true);
                            }}
                            title="Reset Password"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-white cursor-pointer transition inline-flex items-center"
                          >
                            <Icon name="lock" className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedTL(tl);
                              const assigned = teamAssignments.filter(a => a.tl_id === tl.user_id).map(a => a.candidate_id);
                              setSelectedCandidates(assigned);
                              setAssignSearchTerm("");
                              setShowAssignModal(true);
                            }}
                            title="Assign Members"
                            className="p-1.5 rounded-lg bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/10 cursor-pointer transition inline-flex items-center"
                          >
                            <Icon name="profile" className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => toggleBlock(tl)}
                            title={tl.status === "Blocked" ? "Unblock Access" : "Block Access"}
                            className={`p-1.5 rounded-lg cursor-pointer transition inline-flex items-center ${
                              tl.status === "Blocked" 
                                ? "bg-emerald-600/10 hover:bg-emerald-600 text-emerald-450 hover:text-white border border-emerald-500/20" 
                                : "bg-yellow-600/10 hover:bg-yellow-600 text-yellow-500 hover:text-white border border-yellow-500/20"
                            }`}
                          >
                            <Icon name={tl.status === "Blocked" ? "check-circle" : "x-circle"} className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteTL(tl)}
                            title="Delete Team Leader"
                            className="p-1.5 rounded-lg bg-rose-600/10 hover:bg-rose-650 text-rose-500 hover:text-white border border-rose-500/20 cursor-pointer transition inline-flex items-center"
                          >
                            <Icon name="trash" className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: Create Team Leader */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="glass-card rounded-2xl p-6 w-full max-w-md space-y-4 relative border border-slate-700/50">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Icon name="plus" className="text-blue-500" /> Create New Team Leader
              </h3>
              <form onSubmit={handleCreateTL} className="space-y-4 text-xs font-semibold">
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 mb-1">Full Name</label>
                  <input required type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-800 bg-slate-900/60 text-white" placeholder="Name" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 mb-1">Email ID</label>
                  <input required type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-800 bg-slate-900/60 text-white" placeholder="email@krv.com" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 mb-1">Mobile Number</label>
                  <input required type="text" value={formData.mobile} onChange={(e) => setFormData({...formData, mobile: e.target.value})} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-800 bg-slate-900/60 text-white" placeholder="10-digit mobile" maxLength={15} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 mb-1">TL Code</label>
                    <input required type="text" value={formData.tl_code} onChange={(e) => setFormData({...formData, tl_code: e.target.value})} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-800 bg-slate-900/60 text-white uppercase" placeholder="TL002" />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 mb-1">Login Password</label>
                    <input required type="password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-800 bg-slate-900/60 text-white" placeholder="Password" />
                  </div>
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer">Cancel</button>
                  <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white cursor-pointer">Create</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Edit Team Leader */}
        {showEditModal && selectedTL && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="glass-card rounded-2xl p-6 w-full max-w-md space-y-4 relative border border-slate-700/50">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Icon name="edit" className="text-blue-500" /> Edit Team Leader Profile
              </h3>
              <form onSubmit={handleEditTL} className="space-y-4 text-xs font-semibold">
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 mb-1">Full Name</label>
                  <input required type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-800 bg-slate-900/60 text-white" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 mb-1">Mobile Number</label>
                  <input required type="text" value={formData.mobile} onChange={(e) => setFormData({...formData, mobile: e.target.value})} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-800 bg-slate-900/60 text-white" />
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setShowEditModal(false)} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer">Cancel</button>
                  <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white cursor-pointer">Save Changes</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Reset Password */}
        {showPasswordModal && selectedTL && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="glass-card rounded-2xl p-6 w-full max-w-md space-y-4 relative border border-slate-700/50">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Icon name="lock" className="text-rose-500" /> Reset TL Password
              </h3>
              <form onSubmit={handleResetPassword} className="space-y-4 text-xs font-semibold">
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 mb-1">New Password</label>
                  <input required type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-800 bg-slate-900/60 text-white" placeholder="Minimum 6 characters" minLength={6} />
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setShowPasswordModal(false)} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer">Cancel</button>
                  <button type="submit" className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white cursor-pointer">Reset Password</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Assign Candidates */}
        {showAssignModal && selectedTL && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="glass-card rounded-2xl p-6 w-full max-w-lg space-y-4 relative border border-slate-700/50 max-h-[90vh] flex flex-col">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 shrink-0">
                <Icon name="profile" className="text-blue-500" /> Manage Team Assignments
              </h3>
              <div className="text-[10px] text-slate-400 shrink-0">
                Configure candidate members assigned to this Team Leader. Check members to assign them. Unassigned members are shown separately.
              </div>

              <div className="relative w-full shrink-0">
                <input
                  type="text"
                  placeholder="Search available candidates by Name or Email..."
                  value={assignSearchTerm}
                  onChange={(e) => setAssignSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white/5 focus:outline-none focus:border-blue-500 text-white"
                />
                <Icon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>

              <div className="flex-grow overflow-y-auto space-y-4 pr-1">
                {/* Currently Assigned */}
                <div>
                  <h4 className="text-xs font-bold text-slate-300 mb-2 uppercase tracking-wide">Current Team Members ({currentTeamMembers.length})</h4>
                  {currentTeamMembers.length === 0 ? (
                    <div className="text-xs text-slate-500 italic p-3 bg-slate-950/20 rounded-lg">No candidates assigned to this team yet.</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {currentTeamMembers.map(c => (
                        <label key={c.id} className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-850 bg-slate-900/40 hover:bg-slate-800/40 cursor-pointer text-xs text-white">
                          <input
                            type="checkbox"
                            checked={selectedCandidates.includes(c.id)}
                            onChange={() => {
                              if (selectedCandidates.includes(c.id)) {
                                setSelectedCandidates(prev => prev.filter(id => id !== c.id));
                              } else {
                                setSelectedCandidates(prev => [...prev, c.id]);
                              }
                            }}
                            className="rounded text-blue-500 focus:ring-0"
                          />
                          <div>
                            <span className="font-bold block">{c.name}</span>
                            <span className="text-[9px] text-slate-500 font-semibold">{c.email}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* Unassigned Candidates Available */}
                <div>
                  <h4 className="text-xs font-bold text-slate-300 mb-2 uppercase tracking-wide">Available Unassigned Candidates ({unassignedCandidates.length})</h4>
                  {unassignedCandidates.length === 0 ? (
                    <div className="text-xs text-slate-500 italic p-3 bg-slate-950/20 rounded-lg">All candidates are already assigned to a Team Leader.</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {unassignedCandidates.map(c => (
                        <label key={c.id} className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-800 bg-slate-950/30 hover:bg-slate-800/40 cursor-pointer text-xs text-slate-300">
                          <input
                            type="checkbox"
                            checked={selectedCandidates.includes(c.id)}
                            onChange={() => {
                              if (selectedCandidates.includes(c.id)) {
                                setSelectedCandidates(prev => prev.filter(id => id !== c.id));
                              } else {
                                setSelectedCandidates(prev => [...prev, c.id]);
                              }
                            }}
                            className="rounded text-blue-500 focus:ring-0"
                          />
                          <div>
                            <span className="font-bold block text-white">{c.name}</span>
                            <span className="text-[9px] text-slate-500 font-semibold">{c.email}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-800 shrink-0">
                <button type="button" onClick={() => setShowAssignModal(false)} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer text-xs">Cancel</button>
                <button type="button" onClick={handleAssignCandidates} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white cursor-pointer text-xs">Update Assignments</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 2. TEAM PERFORMANCE COMPONENT
  function AdminTeamPerformance({
    users,
    teamLeaders,
    teamAssignments,
    submissions
  }) {
    // Computing performance scores
    const teamPerformances = useMemo(() => {
      return teamLeaders.map(tl => {
        const u = users.find(usr => usr.id === tl.user_id) || {};
        
        // Find team candidate IDs
        const teamCandIds = teamAssignments
          .filter(a => a.tl_id === tl.user_id)
          .map(a => a.candidate_id);

        const teamSubs = submissions.filter(s => teamCandIds.includes(s.user_id));
        const pending = teamSubs.filter(s => s.review_status === "Pending" || s.review_status === "Under Review").length;
        const approved = teamSubs.filter(s => s.review_status === "Approved").length;
        const rejected = teamSubs.filter(s => s.review_status === "Rejected").length;

        // Dynamic activity calculation: based on login times of team members
        const activeCount = users.filter(usr => teamCandIds.includes(usr.id) && usr.status === "Active").length;
        const teamSize = teamCandIds.length;
        let activityStatus = "Red"; // Inactive
        if (teamSize > 0) {
          const activeRatio = activeCount / teamSize;
          if (activeRatio >= 0.7) activityStatus = "Green"; // Active
          else if (activeRatio >= 0.3) activityStatus = "Yellow"; // Low Activity
        }

        // Performance Score = (Approved Tasks / Total Submissions) * 100
        const totalTasks = approved + rejected;
        const score = totalTasks > 0 ? Math.round((approved / totalTasks) * 100) : 0;

        return {
          id: tl.id,
          name: u.name || "N/A",
          code: tl.tl_code,
          size: teamSize,
          pending,
          approved,
          rejected,
          score,
          activityStatus
        };
      });
    }, [teamLeaders, teamAssignments, submissions, users]);

    // Average Performance Score
    const avgScore = useMemo(() => {
      const activeTeams = teamPerformances.filter(t => t.size > 0);
      if (activeTeams.length === 0) return 0;
      const sum = activeTeams.reduce((acc, t) => acc + t.score, 0);
      return Math.round(sum / activeTeams.length);
    }, [teamPerformances]);

    return (
      <div className="space-y-6">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-card rounded-2xl p-5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Average Team Score</span>
            <span className="text-3xl font-extrabold mt-2 text-white block">{avgScore}%</span>
            <span className="text-[10px] text-slate-400 mt-2 block">Weighted approval score of active teams</span>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Top Performing Team</span>
            <span className="text-lg font-bold mt-2 text-emerald-400 block truncate">
              {teamPerformances.length > 0 
                ? [...teamPerformances].sort((a,b) => b.score - a.score)[0]?.name || "N/A"
                : "None"
              }
            </span>
            <span className="text-[10px] text-slate-400 mt-2 block">Highest approval percentage</span>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Pending Submissions</span>
            <span className="text-3xl font-extrabold mt-2 text-yellow-500 block">
              {teamPerformances.reduce((acc, t) => acc + t.pending, 0)}
            </span>
            <span className="text-[10px] text-slate-400 mt-2 block">Requiring review/audit</span>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Active Teams Indicator</span>
            <span className="text-3xl font-extrabold mt-2 text-blue-500 block">
              {teamPerformances.filter(t => t.activityStatus === "Green").length}
            </span>
            <span className="text-[10px] text-slate-400 mt-2 block">Teams with 70%+ active candidates</span>
          </div>
        </div>

        {/* Team Performance Table */}
        <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/5 dark:border-slate-800/40">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 uppercase text-[10px] font-bold tracking-wider">
                  <th className="p-4">Team Leader Name</th>
                  <th className="p-4">Team Size</th>
                  <th className="p-4">Pending Tasks</th>
                  <th className="p-4">Approved Tasks</th>
                  <th className="p-4">Rejected Tasks</th>
                  <th className="p-4">Team Score</th>
                  <th className="p-4 text-center">Activity Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-xs font-medium">
                {teamPerformances.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-8 text-center text-slate-500">No teams registered.</td>
                  </tr>
                ) : (
                  teamPerformances.map(tp => (
                    <tr key={tp.id} className="hover:bg-slate-800/20 text-slate-300">
                      <td className="p-4">
                        <span className="font-bold text-white block">{tp.name}</span>
                        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wide">Code: {tp.code}</span>
                      </td>
                      <td className="p-4"><span className="font-bold text-white">{tp.size}</span> candidates</td>
                      <td className="p-4 text-yellow-500 font-bold">{tp.pending} tasks</td>
                      <td className="p-4 text-emerald-400 font-bold">{tp.approved} tasks</td>
                      <td className="p-4 text-rose-500 font-bold">{tp.rejected} tasks</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-white">{tp.score}%</span>
                          <div className="w-16 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                            <div className="h-full bg-blue-500" style={{ width: `${tp.score}%` }}></div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                          tp.activityStatus === "Green"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : tp.activityStatus === "Yellow"
                            ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                            : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            tp.activityStatus === "Green" ? "bg-emerald-500 animate-pulse" : tp.activityStatus === "Yellow" ? "bg-yellow-500" : "bg-rose-500"
                          }`}></span>
                          {tp.activityStatus === "Green" ? "Active" : tp.activityStatus === "Yellow" ? "Low Activity" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // 3. TEAM ANALYTICS COMPONENT
  function AdminTeamAnalytics({
    users,
    teamLeaders,
    teamAssignments,
    teamReferrals,
    submissions
  }) {
    const chartContainerRef = useRef(null);

    // Leaderboards
    const rankings = useMemo(() => {
      return teamLeaders.map(tl => {
        const u = users.find(usr => usr.id === tl.user_id) || {};
        const teamCandIds = teamAssignments.filter(a => a.tl_id === tl.user_id).map(a => a.candidate_id);
        const approvedCount = submissions.filter(s => teamCandIds.includes(s.user_id) && s.review_status === "Approved").length;
        const totalCount = submissions.filter(s => teamCandIds.includes(s.user_id)).length;
        const referralCount = teamReferrals.filter(r => r.tl_id === tl.user_id).length;

        return {
          name: u.name || "N/A",
          code: tl.tl_code,
          size: teamCandIds.length,
          approved: approvedCount,
          referrals: referralCount,
          total: totalCount
        };
      }).sort((a,b) => b.approved - a.approved); // Sort by approved reviews
    }, [teamLeaders, users, teamAssignments, submissions, teamReferrals]);

    // Graph initialization
    useEffect(() => {
      if (!chartContainerRef.current) return;
      const ctx = chartContainerRef.current.getContext('2d');
      if (!ctx) return;

      // Group referrals by date
      const dateMap = {};
      teamReferrals.forEach(ref => {
        if (ref.registered_at) {
          dateMap[ref.registered_at] = (dateMap[ref.registered_at] || 0) + 1;
        }
      });

      const labels = Object.keys(dateMap).sort();
      const dataPoints = labels.map(l => dateMap[l]);

      // If empty, show dummy trend lines
      const displayLabels = labels.length > 0 ? labels : ["2026-06-08", "2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12"];
      const displayData = dataPoints.length > 0 ? dataPoints : [1, 3, 2, 4, 5];

      const chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: displayLabels,
          datasets: [{
            label: 'New Registrations via TL Referral',
            data: displayData,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            tension: 0.3,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: { color: '#94a3b8', font: { size: 10, weight: 'bold' } }
            }
          },
          scales: {
            y: {
              grid: { color: 'rgba(148, 163, 184, 0.05)' },
              ticks: { color: '#94a3b8', stepSize: 1 }
            },
            x: {
              grid: { color: 'rgba(148, 163, 184, 0.05)' },
              ticks: { color: '#94a3b8' }
            }
          }
        }
      });

      return () => chart.destroy();
    }, [teamReferrals]);

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Referral Chart */}
        <div className="glass-card rounded-2xl p-5 lg:col-span-2 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Team Growth Trend</h3>
          <div className="h-64 relative">
            <canvas ref={chartContainerRef}></canvas>
          </div>
        </div>

        {/* Team Leader Rankings */}
        <div className="glass-card rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Team Leader Leaderboard</h3>
          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {rankings.length === 0 ? (
              <div className="text-xs text-slate-500 italic p-3 text-center">No team leader data.</div>
            ) : (
              rankings.map((r, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-950/20">
                  <div className="flex items-center gap-2">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      idx === 0 ? "bg-amber-500 text-slate-950" : idx === 1 ? "bg-slate-300 text-slate-950" : idx === 2 ? "bg-orange-600 text-white" : "bg-slate-800 text-slate-400"
                    }`}>
                      {idx + 1}
                    </span>
                    <div>
                      <span className="text-xs font-bold text-white block leading-tight">{r.name}</span>
                      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wide">{r.code} • Size {r.size}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-extrabold text-blue-400 block">{r.approved} Approvals</span>
                    <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wide">{r.referrals} referrals</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // 4. TEAM INCENTIVES COMPONENT
  function AdminTeamIncentives({
    users,
    teamLeaders,
    teamIncentives,
    setTeamIncentives,
    teamIncentiveRules,
    setTeamIncentiveRules,
    triggerToast
  }) {
    const [showCreateRuleModal, setShowCreateRuleModal] = useState(false);
    const [ruleFormData, setRuleFormData] = useState({ name: "", desc: "", minTasks: 0, bonus: 0 });

    // Rules save handler
    const handleSaveRule = async (e) => {
      e.preventDefault();
      if (!ruleFormData.name || !ruleFormData.bonus) {
        triggerToast("Rule Name and Bonus Amount are required.", "error");
        return;
      }

      try {
        const newRule = {
          id: "rule_" + Date.now(),
          rule_name: ruleFormData.name,
          description: ruleFormData.desc,
          min_tasks: parseInt(ruleFormData.minTasks, 10) || 0,
          bonus_amount: parseFloat(ruleFormData.bonus) || 0,
          active: true
        };

        await window.TeamDB.saveIncentiveRule(newRule);
        setTeamIncentiveRules(prev => [...prev, newRule]);

        triggerToast("Incentive rule created!");
        setShowCreateRuleModal(false);
        setRuleFormData({ name: "", desc: "", minTasks: 0, bonus: 0 });
      } catch (err) {
        triggerToast("Error saving incentive rule.", "error");
      }
    };

    // Rule Status Toggle
    const toggleRule = async (rule) => {
      try {
        const updated = { ...rule, active: !rule.active };
        await window.TeamDB.saveIncentiveRule(updated);
        setTeamIncentiveRules(prev => prev.map(r => r.id === rule.id ? updated : r));
        triggerToast(`Rule status updated.`);
      } catch (e) {
        triggerToast("Error updating rule.", "error");
      }
    };

    // Approve Claim
    const handleApproveClaim = async (claim) => {
      try {
        const updated = { ...claim, status: "Approved", approved_at: new Date().toISOString().split('T')[0] };
        await window.TeamDB.saveIncentive(updated);

        // Update TL's wallet in krv_users
        const tlUser = users.find(u => u.id === claim.tl_id);
        if (tlUser) {
          const updatedUser = {
            ...tlUser,
            wallet_balance: (tlUser.wallet_balance || 0) + claim.amount,
            earnings_paid: (tlUser.earnings_paid || 0) + claim.amount // Increment paid or tracking earnings
          };
          await window.TeamDB.saveUser(updatedUser);
        }

        setTeamIncentives(prev => prev.map(i => i.id === claim.id ? updated : i));

        // Create notification for TL
        await window.TeamDB.saveNotification({
          user_id: claim.tl_id,
          title: "Incentive Claim Approved",
          message: `Your incentive claim of ₹${claim.amount} for "${claim.rule_name}" has been approved and credited to your wallet.`
        });

        triggerToast(`Claim approved and credited to wallet!`);
      } catch (err) {
        triggerToast("Error approving claim.", "error");
      }
    };

    // Reject Claim
    const handleRejectClaim = async (claim) => {
      try {
        const updated = { ...claim, status: "Rejected" };
        await window.TeamDB.saveIncentive(updated);
        setTeamIncentives(prev => prev.map(i => i.id === claim.id ? updated : i));
        triggerToast(`Claim rejected successfully.`);
      } catch (e) {
        triggerToast("Error rejecting claim.", "error");
      }
    };

    return (
      <div className="space-y-6">
        {/* Rules Configurations */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Incentive Rules Configurations</h3>
            <button
              onClick={() => setShowCreateRuleModal(true)}
              className="px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md cursor-pointer transition flex items-center gap-1.5"
            >
              <Icon name="plus" className="w-4 h-4" /> Add Incentive Rule
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {teamIncentiveRules.map(rule => (
              <div key={rule.id} className="glass-card rounded-2xl p-5 border border-slate-800 bg-slate-900/30 flex justify-between items-start gap-4 text-xs">
                <div className="space-y-1">
                  <span className="font-extrabold text-white text-sm block">{rule.rule_name}</span>
                  <p className="text-slate-400 leading-relaxed text-[11px]">{rule.description}</p>
                  <div className="flex gap-4 pt-1 text-[10px] text-slate-500 font-bold uppercase">
                    <span>Min Tasks Required: {rule.min_tasks}</span>
                    <span>Bonus: ₹{rule.bonus_amount}</span>
                  </div>
                </div>
                <button
                  onClick={() => toggleRule(rule)}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase cursor-pointer border transition shrink-0 ${
                    rule.active 
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20" 
                      : "bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20"
                  }`}
                >
                  {rule.active ? "Active" : "Disabled"}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Claims Table */}
        <div className="space-y-4 pt-4 border-t border-slate-850">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Team Leader Incentive Claims</h3>

          <div className="glass-card rounded-2xl overflow-hidden border border-slate-200/5 dark:border-slate-800/40">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 uppercase text-[10px] font-bold tracking-wider">
                    <th className="p-4">Team Leader</th>
                    <th className="p-4">Incentive Target</th>
                    <th className="p-4">Amount Claimed</th>
                    <th className="p-4">Claimed Date</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 text-xs font-medium">
                  {teamIncentives.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-8 text-center text-slate-500">No incentive claims logged yet.</td>
                    </tr>
                  ) : (
                    teamIncentives.map(inc => {
                      const tlUser = users.find(u => u.id === inc.tl_id) || {};
                      return (
                        <tr key={inc.id} className="hover:bg-slate-800/20 text-slate-300">
                          <td className="p-4">
                            <span className="font-bold text-white block">{tlUser.name || "N/A"}</span>
                            <span className="text-[10px] text-slate-500 leading-none">{tlUser.email}</span>
                          </td>
                          <td className="p-4 font-bold text-white">{inc.rule_name}</td>
                          <td className="p-4 text-emerald-400 font-extrabold text-sm">₹{inc.amount}</td>
                          <td className="p-4 text-slate-400">{inc.created_at || "N/A"}</td>
                          <td className="p-4">
                            <span className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase border ${
                              inc.status === "Approved"
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                : inc.status === "Rejected"
                                ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                                : "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
                            }`}>
                              {inc.status}
                            </span>
                          </td>
                          <td className="p-4 text-right space-x-2">
                            {inc.status === "Pending" ? (
                              <>
                                <button
                                  onClick={() => handleApproveClaim(inc)}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold shadow transition cursor-pointer"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleRejectClaim(inc)}
                                  className="px-2.5 py-1.5 rounded-lg bg-rose-600/10 hover:bg-rose-600 text-rose-500 hover:text-white border border-rose-500/20 text-[10px] font-bold transition cursor-pointer"
                                >
                                  Reject
                                </button>
                              </>
                            ) : (
                              <span className="text-[10px] text-slate-500 font-bold uppercase">No Actions</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal: Create Incentive Rule */}
        {showCreateRuleModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="glass-card rounded-2xl p-6 w-full max-w-md space-y-4 relative border border-slate-700/50">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Icon name="plus" className="text-blue-500" /> Create Incentive Rule
              </h3>
              <form onSubmit={handleSaveRule} className="space-y-4 text-xs font-semibold">
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 mb-1">Rule Name</label>
                  <input required type="text" value={ruleFormData.name} onChange={(e) => setRuleFormData({...ruleFormData, name: e.target.value})} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-800 bg-slate-900/60 text-white" placeholder="Active recruiter bonus, monthly milestones..." />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 mb-1">Description</label>
                  <textarea required value={ruleFormData.desc} onChange={(e) => setRuleFormData({...ruleFormData, desc: e.target.value})} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-800 bg-slate-900/60 text-white resize-none" rows="2" placeholder="Write description detail..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 mb-1">Min. Team Approved Tasks</label>
                    <input required type="number" value={ruleFormData.minTasks} onChange={(e) => setRuleFormData({...ruleFormData, minTasks: e.target.value})} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-800 bg-slate-900/60 text-white" placeholder="e.g. 5" min="0" />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-slate-400 mb-1">Bonus Amount (₹)</label>
                    <input required type="number" value={ruleFormData.bonus} onChange={(e) => setRuleFormData({...ruleFormData, bonus: e.target.value})} className="w-full px-3 py-2 text-xs rounded-lg border border-slate-800 bg-slate-900/60 text-white" placeholder="e.g. 200" min="0" />
                  </div>
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setShowCreateRuleModal(false)} className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer">Cancel</button>
                  <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white cursor-pointer">Save Rule</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 5. TEAM TRANSFERS COMPONENT
  function AdminTeamTransfers({
    users,
    teamLeaders,
    teamAssignments,
    setTeamAssignments,
    triggerToast
  }) {
    const [selectedCandidateId, setSelectedCandidateId] = useState("");
    const [selectedNewTLId, setSelectedNewTLId] = useState("");

    // Candidates list
    const candidates = useMemo(() => {
      return users.filter(u => u.role === "candidate");
    }, [users]);

    // Current TL details
    const currentTL = useMemo(() => {
      if (!selectedCandidateId) return null;
      const asg = teamAssignments.find(a => a.candidate_id === selectedCandidateId);
      if (!asg) return { name: "None (Unassigned)", id: null };
      
      const tlProfile = teamLeaders.find(t => t.user_id === asg.tl_id);
      const tlUser = users.find(u => u.id === asg.tl_id);

      return {
        name: tlUser ? `${tlUser.name} (${tlProfile?.tl_code || "N/A"})` : "Unknown Leader",
        id: asg.tl_id,
        assignment_id: asg.id
      };
    }, [selectedCandidateId, teamAssignments, teamLeaders, users]);

    // Handle Transfer
    const handleTransfer = async () => {
      if (!selectedCandidateId || !selectedNewTLId) {
        triggerToast("Please select both a Candidate and a New Team Leader.", "error");
        return;
      }

      if (currentTL && currentTL.id === selectedNewTLId) {
        triggerToast("The candidate is already assigned to this Team Leader.", "error");
        return;
      }

      try {
        const candidateUser = users.find(u => u.id === selectedCandidateId);
        const newTLUser = users.find(u => u.id === selectedNewTLId);

        if (currentTL && currentTL.id) {
          // Update existing assignment
          const { success } = await window.TeamDB.saveAssignment({
            id: currentTL.assignment_id,
            tl_id: selectedNewTLId,
            candidate_id: selectedCandidateId,
            assigned_at: new Date().toISOString().split('T')[0]
          });
        } else {
          // Create new assignment
          const newAsg = {
            id: "asg_" + Date.now(),
            tl_id: selectedNewTLId,
            candidate_id: selectedCandidateId,
            assigned_at: new Date().toISOString().split('T')[0]
          };
          await window.TeamDB.saveAssignment(newAsg);
        }

        // Refresh state
        const updated = await window.TeamDB.getAssignments();
        setTeamAssignments(updated);

        // Log Transfer Activity
        await window.TeamDB.logActivity({
          user_id: selectedCandidateId,
          action: "CANDIDATE_TRANSFER",
          details: `Candidate "${candidateUser?.name || selectedCandidateId}" transferred to Team Leader "${newTLUser?.name || selectedNewTLId}".`
        });

        // Notify Candidate
        await window.TeamDB.saveNotification({
          user_id: selectedCandidateId,
          title: "Team Leader Assigned",
          message: `You have been assigned to Team Leader: ${newTLUser?.name || selectedNewTLId}. Your referral source is updated.`
        });

        triggerToast(`Candidate transferred successfully!`);
        setSelectedCandidateId("");
        setSelectedNewTLId("");
      } catch (err) {
        console.error("Transfer candidate error:", err);
        triggerToast("Error transferring candidate.", "error");
      }
    };

    return (
      <div className="max-w-xl mx-auto glass-card rounded-2xl p-6 border border-slate-200/5 dark:border-slate-800/40 space-y-6 text-xs font-semibold">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Icon name="reports" className="text-blue-500" /> Transfer Candidate to Team Leader
        </h3>
        
        <div className="space-y-4">
          {/* Select Candidate */}
          <div>
            <label className="block text-[10px] uppercase text-slate-400 mb-1.5">Select Candidate</label>
            <select
              value={selectedCandidateId}
              onChange={(e) => setSelectedCandidateId(e.target.value)}
              className="w-full px-3.5 py-2.5 text-xs rounded-lg border border-slate-800 bg-slate-900 focus:outline-none focus:border-blue-500 text-white cursor-pointer"
            >
              <option value="">-- Choose Candidate --</option>
              {candidates.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
              ))}
            </select>
          </div>

          {/* Current Team Leader Display */}
          {selectedCandidateId && (
            <div className="p-4 rounded-xl bg-slate-950/20 border border-slate-850 flex justify-between items-center text-xs">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Current Team Leader:</span>
              <span className="font-extrabold text-white">{currentTL?.name || "None (Unassigned)"}</span>
            </div>
          )}

          {/* Select New Team Leader */}
          <div>
            <label className="block text-[10px] uppercase text-slate-400 mb-1.5">Select New Team Leader</label>
            <select
              value={selectedNewTLId}
              onChange={(e) => setSelectedNewTLId(e.target.value)}
              disabled={!selectedCandidateId}
              className="w-full px-3.5 py-2.5 text-xs rounded-lg border border-slate-800 bg-slate-900 focus:outline-none focus:border-blue-500 text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">-- Choose New Leader --</option>
              {teamLeaders.filter(t => t.status === "Active").map(tl => {
                const tlUser = users.find(u => u.id === tl.user_id) || {};
                return (
                  <option key={tl.id} value={tl.user_id}>{tlUser.name} ({tl.tl_code})</option>
                );
              })}
            </select>
          </div>

          {/* Transfer Button */}
          <button
            type="button"
            onClick={handleTransfer}
            disabled={!selectedCandidateId || !selectedNewTLId}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold shadow-md cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-xs"
          >
            Confirm Candidate Transfer
          </button>
        </div>
      </div>
    );
  }

  // Expose components globally
  window.AdminTeamLeaders = AdminTeamLeaders;
  window.AdminTeamPerformance = AdminTeamPerformance;
  window.AdminTeamAnalytics = AdminTeamAnalytics;
  window.AdminTeamIncentives = AdminTeamIncentives;
  window.AdminTeamTransfers = AdminTeamTransfers;
})();
