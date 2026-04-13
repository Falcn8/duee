const API_BASE = "/api";
const TASKS_CACHE_KEY = "duee:web:tasks-cache:v3";
const LEGACY_TASKS_CACHE_KEY = "duee:web:tasks-cache:v2";
const LOCAL_TASKS_KEY = "duee:web:tasks:v1";
const PREFS_KEY = "duee:web:prefs:v1";
const AUTH_MODE_KEY = "duee:web:auth-mode:v1";
const CALENDAR_MIN_MONTH = -120;
const CALENDAR_MAX_MONTH = 120;
const DELETE_ACCOUNT_CONFIRMATION_TOKEN = "DELETE";
const AUTO_SYNC_INTERVAL_MS = 60 * 1000;
const AUTO_SYNC_MIN_GAP_MS = 10 * 1000;
const AUTH_ACTION_TOKEN_REGEX = /^[A-Za-z0-9_-]{32,256}$/;

const state = {
  tasks: [],
  prefs: loadPrefs(),
  authMode: loadAuthMode(),
  sessionUser: null,
  currentView: "tasks",
  showVerifySentPage: false,
  postRegisterEmail: "",
  postRegisterVerificationEmailSent: true,
  authRequestInFlight: false,
  profileRequestInFlight: false,
  prefsSyncInFlight: false,
  prefsSyncPending: false,
  profileEditing: false,
  draftHasDueDate: true,
  editHasDueDate: true,
  editingTaskId: null,
  requestInFlight: false,
  pendingTaskMutationIds: new Set(),
  useLocalStorageMode: false,
  sideCalendarMonth: startOfMonth(new Date()),
  sideCalendarSelectedIso: null,
  calendarTarget: null,
  calendarMonth: startOfMonth(new Date()),
  calendarFocusedIso: null,
  calendarReturnFocusEl: null,
  activeToastSource: null,
  toastDismissTimeoutId: null,
  pendingTaskDeleteResolver: null,
  pendingDeleteAccountResolver: null,
  pendingResetPasswordToken: "",
  developerToolsOpen: false,
  recentlyCompletedTaskIds: new Set(),
  autoSyncTimerId: null,
  autoSyncInFlight: false,
  lastAutoSyncAt: 0,
};

const refs = {
  homeButton: document.getElementById("homeButton"),
  dueDateSelect: document.getElementById("dueDateSelect"),
  dueDateInput: document.getElementById("dueDateInput"),
  dueDateToggle: document.getElementById("dueDateToggle"),
  taskInput: document.getElementById("taskInput"),
  addButton: document.getElementById("addButton"),
  tasksContent: document.getElementById("tasksContent"),
  tasksMain: document.getElementById("tasksMain"),
  statusPanel: document.getElementById("statusPanel"),
  statusLine: document.getElementById("statusLine"),
  statusActions: document.getElementById("statusActions"),
  statusRetry: document.getElementById("statusRetry"),
  statusSignIn: document.getElementById("statusSignIn"),
  activeList: document.getElementById("activeList"),
  doneList: document.getElementById("doneList"),
  emptyUpcoming: document.getElementById("emptyUpcoming"),
  emptyDone: document.getElementById("emptyDone"),
  sideCalendarCard: document.getElementById("sideCalendarCard"),
  sideCalendarMonthLabel: document.getElementById("sideCalendarMonthLabel"),
  sideCalendarPrev: document.getElementById("sideCalendarPrev"),
  sideCalendarNext: document.getElementById("sideCalendarNext"),
  sideCalendarBody: document.getElementById("sideCalendarBody"),
  sideCalendarGrid: document.getElementById("sideCalendarGrid"),
  sideCalendarDetails: document.getElementById("sideCalendarDetails"),
  tasksShell: document.getElementById("tasksShell"),
  accountBar: document.getElementById("accountBar"),
  accountIdentity: document.getElementById("accountIdentity"),
  accountDisplayName: document.getElementById("accountDisplayName"),
  logoutButton: document.getElementById("logoutButton"),
  authPanel: document.getElementById("authPanel"),
  authTitle: document.getElementById("authTitle"),
  authHint: document.getElementById("authHint"),
  authForm: document.getElementById("authForm"),
  authDisplayNameField: document.getElementById("authDisplayNameField"),
  authDisplayName: document.getElementById("authDisplayName"),
  authEmail: document.getElementById("authEmail"),
  authPassword: document.getElementById("authPassword"),
  authSubmit: document.getElementById("authSubmit"),
  authForgotRow: document.getElementById("authForgotRow"),
  authForgotPasswordButton: document.getElementById("authForgotPasswordButton"),
  authSwitchPrefix: document.getElementById("authSwitchPrefix"),
  authSwitchButton: document.getElementById("authSwitchButton"),
  authStatus: document.getElementById("authStatus"),
  authVerifySentPage: document.getElementById("authVerifySentPage"),
  authVerifySentTitle: document.getElementById("authVerifySentTitle"),
  authVerifySentMessage: document.getElementById("authVerifySentMessage"),
  authVerifySentStatus: document.getElementById("authVerifySentStatus"),
  authVerifySentSignInButton: document.getElementById("authVerifySentSignInButton"),
  authVerifySentResendButton: document.getElementById("authVerifySentResendButton"),
  authVerifySentDeleteButton: document.getElementById("authVerifySentDeleteButton"),
  profilePage: document.getElementById("profilePage"),
  profileForm: document.getElementById("profileForm"),
  profileDisplayNameValue: document.getElementById("profileDisplayNameValue"),
  profileDisplayNameInput: document.getElementById("profileDisplayNameInput"),
  profileDisplayNameEditor: document.getElementById("profileDisplayNameEditor"),
  profileEditButton: document.getElementById("profileEditButton"),
  profileCancelEditButton: document.getElementById("profileCancelEditButton"),
  profileEmail: document.getElementById("profileEmail"),
  profileEmailVerification: document.getElementById("profileEmailVerification"),
  profileResendVerificationButton: document.getElementById("profileResendVerificationButton"),
  profileCreatedAt: document.getElementById("profileCreatedAt"),
  profileUserId: document.getElementById("profileUserId"),
  profileStatus: document.getElementById("profileStatus"),
  profileHideDoneToggle: document.getElementById("profileHideDoneToggle"),
  profileReceiveUpdatesToggle: document.getElementById("profileReceiveUpdatesToggle"),
  profileConfirmDeleteToggle: document.getElementById("profileConfirmDeleteToggle"),
  profileHorizontalSectionsToggle: document.getElementById("profileHorizontalSectionsToggle"),
  profileSideCalendarToggle: document.getElementById("profileSideCalendarToggle"),
  profileExportDataButton: document.getElementById("profileExportDataButton"),
  profileDeleteDataButton: document.getElementById("profileDeleteDataButton"),
  profileBackButton: document.getElementById("profileBackButton"),
  profileSaveButton: document.getElementById("profileSaveButton"),
  developerToggleButton: document.getElementById("developerToggleButton"),
  developerPanel: document.getElementById("developerPanel"),
  developerReplaceImportToggle: document.getElementById("developerReplaceImportToggle"),
  developerImportFileInput: document.getElementById("developerImportFileInput"),
  developerImportButton: document.getElementById("developerImportButton"),
  developerExportTasksButton: document.getElementById("developerExportTasksButton"),
  developerClearCompletedButton: document.getElementById("developerClearCompletedButton"),
  developerForceSyncButton: document.getElementById("developerForceSyncButton"),
  developerExportSnapshotButton: document.getElementById("developerExportSnapshotButton"),
  developerStatus: document.getElementById("developerStatus"),
  calendarDialog: document.getElementById("calendarDialog"),
  calendarPrev: document.getElementById("calendarPrev"),
  calendarNext: document.getElementById("calendarNext"),
  calendarMonthLabel: document.getElementById("calendarMonthLabel"),
  calendarGrid: document.getElementById("calendarGrid"),
  calendarToday: document.getElementById("calendarToday"),
  calendarClear: document.getElementById("calendarClear"),
  calendarDone: document.getElementById("calendarDone"),
  editDialog: document.getElementById("editDialog"),
  editForm: document.getElementById("editForm"),
  editTaskInput: document.getElementById("editTaskInput"),
  editDueDateSelect: document.getElementById("editDueDateSelect"),
  editDueDateInput: document.getElementById("editDueDateInput"),
  editDueToggle: document.getElementById("editDueToggle"),
  cancelEdit: document.getElementById("cancelEdit"),
  deleteTaskDialog: document.getElementById("deleteTaskDialog"),
  deleteTaskPrompt: document.getElementById("deleteTaskPrompt"),
  deleteTaskCancel: document.getElementById("deleteTaskCancel"),
  deleteTaskConfirm: document.getElementById("deleteTaskConfirm"),
  deleteAccountDialog: document.getElementById("deleteAccountDialog"),
  deleteAccountForm: document.getElementById("deleteAccountForm"),
  deleteAccountConfirmInput: document.getElementById("deleteAccountConfirmInput"),
  deleteAccountPasswordInput: document.getElementById("deleteAccountPasswordInput"),
  deleteAccountDialogStatus: document.getElementById("deleteAccountDialogStatus"),
  deleteAccountCancel: document.getElementById("deleteAccountCancel"),
  deleteAccountConfirm: document.getElementById("deleteAccountConfirm"),
  forgotPasswordDialog: document.getElementById("forgotPasswordDialog"),
  forgotPasswordForm: document.getElementById("forgotPasswordForm"),
  forgotPasswordEmailInput: document.getElementById("forgotPasswordEmailInput"),
  forgotPasswordDialogStatus: document.getElementById("forgotPasswordDialogStatus"),
  forgotPasswordCancel: document.getElementById("forgotPasswordCancel"),
  forgotPasswordSubmit: document.getElementById("forgotPasswordSubmit"),
  resetPasswordDialog: document.getElementById("resetPasswordDialog"),
  resetPasswordForm: document.getElementById("resetPasswordForm"),
  resetPasswordInput: document.getElementById("resetPasswordInput"),
  resetPasswordConfirmInput: document.getElementById("resetPasswordConfirmInput"),
  resetPasswordDialogStatus: document.getElementById("resetPasswordDialogStatus"),
  resetPasswordCancel: document.getElementById("resetPasswordCancel"),
  resetPasswordSubmit: document.getElementById("resetPasswordSubmit"),
  taskTemplate: document.getElementById("taskTemplate"),
  toastRegion: document.getElementById("toastRegion"),
};

init().catch((error) => {
  setStatus(error.message || "Failed to start app.", "error", { retry: true });
});

async function init() {
  const today = isoDay(startOfLocalDay(new Date()));
  refs.dueDateInput.value = today;

  refs.addButton.addEventListener("click", addTaskFromDraft);
  refs.taskInput.addEventListener("keydown", (event) => {
    const isImeComposition = event.isComposing || event.keyCode === 229;
    if (event.key === "Enter" && !isImeComposition) {
      event.preventDefault();
      addTaskFromDraft();
    }
  });
  refs.taskInput.addEventListener("input", syncAddButtonUI);

  refs.dueDateSelect.addEventListener("click", () => {
    if (!state.draftHasDueDate) {
      state.draftHasDueDate = true;
      if (!refs.dueDateInput.value) {
        refs.dueDateInput.value = isoDay(startOfLocalDay(new Date()));
      }
      syncDueToggleUI();
    }
    openCalendar("draft");
  });

  refs.dueDateInput.addEventListener("change", () => {
    if (refs.dueDateInput.value) {
      state.draftHasDueDate = true;
    }
    syncDueToggleUI();
  });

  refs.dueDateToggle.addEventListener("click", () => {
    state.draftHasDueDate = !state.draftHasDueDate;
    if (!state.draftHasDueDate) {
      refs.dueDateInput.value = "";
    } else if (!refs.dueDateInput.value) {
      refs.dueDateInput.value = isoDay(startOfLocalDay(new Date()));
    }
    syncDueToggleUI();
  });

  refs.profileHideDoneToggle?.addEventListener("change", () => {
    state.prefs.minimalMode = Boolean(refs.profileHideDoneToggle.checked);
    persistPrefs({ renderTasks: true });
  });

  refs.profileReceiveUpdatesToggle?.addEventListener("change", () => {
    state.prefs.receiveUpdates = Boolean(refs.profileReceiveUpdatesToggle.checked);
    persistPrefs();
  });

  refs.profileConfirmDeleteToggle?.addEventListener("change", () => {
    state.prefs.confirmDeletes = Boolean(refs.profileConfirmDeleteToggle.checked);
    persistPrefs();
  });

  refs.profileHorizontalSectionsToggle?.addEventListener("change", () => {
    state.prefs.horizontalTaskSections = Boolean(refs.profileHorizontalSectionsToggle.checked);
    persistPrefs({ renderTasks: true });
  });

  refs.profileSideCalendarToggle?.addEventListener("change", () => {
    state.prefs.sideCalendarVisible = Boolean(refs.profileSideCalendarToggle.checked);
    persistPrefs();
  });

  refs.sideCalendarPrev?.addEventListener("click", () => {
    state.sideCalendarMonth = addMonths(state.sideCalendarMonth, -1);
    renderSideCalendar();
  });

  refs.sideCalendarNext?.addEventListener("click", () => {
    state.sideCalendarMonth = addMonths(state.sideCalendarMonth, 1);
    renderSideCalendar();
  });

  refs.sideCalendarGrid?.addEventListener("click", (event) => {
    const dayButton = event.target.closest("button[data-iso]");
    if (!dayButton) {
      return;
    }

    const dayIso = dayButton.dataset.iso;
    if (state.sideCalendarSelectedIso === dayIso) {
      state.sideCalendarSelectedIso = null;
      clearSideCalendarDetails();
      renderSideCalendar();
      return;
    }

    state.sideCalendarSelectedIso = dayIso;
    showSideCalendarDetails(dayIso, { showEmpty: true });
    renderSideCalendar();
  });

  refs.sideCalendarGrid?.addEventListener("mouseover", (event) => {
    if (state.sideCalendarSelectedIso) {
      return;
    }
    const dayButton = event.target.closest("button[data-iso]");
    if (!dayButton) {
      return;
    }
    showSideCalendarDetails(dayButton.dataset.iso);
  });

  refs.sideCalendarGrid?.addEventListener("focusin", (event) => {
    if (state.sideCalendarSelectedIso) {
      return;
    }
    const dayButton = event.target.closest("button[data-iso]");
    if (!dayButton) {
      return;
    }
    showSideCalendarDetails(dayButton.dataset.iso);
  });

  refs.sideCalendarGrid?.addEventListener("mouseleave", () => {
    if (state.sideCalendarSelectedIso) {
      showSideCalendarDetails(state.sideCalendarSelectedIso, { showEmpty: true });
      return;
    }
    clearSideCalendarDetails();
  });

  refs.sideCalendarGrid?.addEventListener("focusout", (event) => {
    if (refs.sideCalendarGrid.contains(event.relatedTarget)) {
      return;
    }
    if (state.sideCalendarSelectedIso) {
      showSideCalendarDetails(state.sideCalendarSelectedIso, { showEmpty: true });
      return;
    }
    clearSideCalendarDetails();
  });

  refs.activeList.addEventListener("click", onTaskAction);
  refs.doneList.addEventListener("click", onTaskAction);

  refs.editDueToggle.addEventListener("click", () => {
    state.editHasDueDate = !state.editHasDueDate;
    if (!state.editHasDueDate) {
      refs.editDueDateInput.value = "";
    } else if (!refs.editDueDateInput.value) {
      refs.editDueDateInput.value = isoDay(startOfLocalDay(new Date()));
    }
    syncEditDueToggleUI();
  });

  refs.editDueDateSelect.addEventListener("click", () => {
    if (!state.editHasDueDate) {
      state.editHasDueDate = true;
      if (!refs.editDueDateInput.value) {
        refs.editDueDateInput.value = isoDay(startOfLocalDay(new Date()));
      }
      syncEditDueToggleUI();
    }
    openCalendar("edit");
  });

  refs.editDueDateInput.addEventListener("change", () => {
    if (refs.editDueDateInput.value) {
      state.editHasDueDate = true;
    }
    syncEditDueToggleUI();
  });

  refs.cancelEdit.addEventListener("click", closeEditDialog);

  refs.editForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveEdit();
  });

  refs.editDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeEditDialog();
  });

  refs.editDialog?.addEventListener("close", () => {
    state.editingTaskId = null;
  });

  refs.deleteTaskCancel?.addEventListener("click", () => {
    resolveTaskDeletePrompt(false);
  });

  refs.deleteTaskConfirm?.addEventListener("click", () => {
    resolveTaskDeletePrompt(true);
  });

  refs.deleteTaskDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    resolveTaskDeletePrompt(false);
  });

  refs.deleteAccountCancel?.addEventListener("click", () => {
    resolveDeleteAccountPrompt(null);
  });

  refs.deleteAccountDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    resolveDeleteAccountPrompt(null);
  });

  refs.deleteAccountForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitDeleteAccountDialog();
  });

  refs.calendarPrev.addEventListener("click", () => {
    shiftCalendarMonth(-1);
  });

  refs.calendarNext.addEventListener("click", () => {
    shiftCalendarMonth(1);
  });

  refs.calendarGrid.addEventListener("click", (event) => {
    const dayButton = event.target.closest("button[data-iso]");
    if (!dayButton) {
      return;
    }
    applyCalendarSelection(dayButton.dataset.iso);
  });

  refs.calendarGrid.addEventListener("keydown", handleCalendarKeydown);

  refs.calendarToday.addEventListener("click", () => {
    applyCalendarSelection(isoDay(startOfLocalDay(new Date())));
  });

  refs.calendarClear.addEventListener("click", () => {
    clearCalendarSelection();
  });

  refs.calendarDone.addEventListener("click", () => {
    closeCalendar();
  });

  refs.calendarDialog.addEventListener("click", (event) => {
    if (event.target === refs.calendarDialog) {
      closeCalendar();
    }
  });

  refs.calendarDialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeCalendar();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !refs.calendarDialog.hidden) {
      event.preventDefault();
      closeCalendar();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      triggerAutoSync("visibility");
    }
  });

  window.addEventListener("focus", () => {
    triggerAutoSync("focus");
  });

  window.addEventListener("online", () => {
    triggerAutoSync("online");
  });

  window.addEventListener("beforeunload", () => {
    stopAutoSyncLoop();
  });

  refs.statusRetry?.addEventListener("click", () => {
    retryTaskSync();
  });

  refs.statusSignIn?.addEventListener("click", () => {
    promptSignInFromStatus();
  });

  refs.authSwitchButton?.addEventListener("click", () => {
    state.authMode = state.authMode === "register" ? "login" : "register";
    saveAuthMode();
    clearAuthStatus();
    syncAuthModeUI();
  });

  refs.authForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitAuth();
  });

  refs.authForgotPasswordButton?.addEventListener("click", () => {
    openForgotPasswordDialog();
  });

  refs.authVerifySentSignInButton?.addEventListener("click", () => {
    showSignInAfterVerificationPrompt();
  });

  refs.authVerifySentResendButton?.addEventListener("click", () => {
    resendVerificationFromVerifySentPage();
  });

  refs.authVerifySentDeleteButton?.addEventListener("click", () => {
    deleteAccountData();
  });

  refs.homeButton?.addEventListener("click", () => {
    openTasksPage({ focusMainInput: true });
  });

  refs.accountIdentity?.addEventListener("click", () => {
    openProfilePage();
  });

  refs.logoutButton?.addEventListener("click", () => {
    logoutCurrentUser();
  });

  refs.profileBackButton?.addEventListener("click", () => {
    openTasksPage({ focusMainInput: true });
  });

  refs.profileEditButton?.addEventListener("click", () => {
    openProfileEditPanel();
  });

  refs.profileCancelEditButton?.addEventListener("click", () => {
    closeProfileEditPanel();
  });

  refs.profileForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveProfile();
  });

  refs.profileExportDataButton?.addEventListener("click", () => {
    exportAccountData();
  });

  refs.profileDeleteDataButton?.addEventListener("click", () => {
    deleteAccountData();
  });

  refs.profileResendVerificationButton?.addEventListener("click", () => {
    resendEmailVerification();
  });

  refs.developerToggleButton?.addEventListener("click", () => {
    state.developerToolsOpen = !state.developerToolsOpen;
    syncDeveloperToolsUI();
  });

  refs.developerExportTasksButton?.addEventListener("click", () => {
    exportTodoListForDeveloper();
  });

  refs.developerImportButton?.addEventListener("click", () => {
    importTodoListForDeveloper();
  });

  refs.developerClearCompletedButton?.addEventListener("click", () => {
    clearCompletedTasksForDeveloper();
  });

  refs.developerForceSyncButton?.addEventListener("click", () => {
    forceSyncForDeveloper();
  });

  refs.developerExportSnapshotButton?.addEventListener("click", () => {
    exportDebugSnapshotForDeveloper();
  });

  refs.forgotPasswordCancel?.addEventListener("click", () => {
    closeDialogElement(refs.forgotPasswordDialog);
  });

  refs.forgotPasswordDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialogElement(refs.forgotPasswordDialog);
  });

  refs.forgotPasswordForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitForgotPasswordDialog();
  });

  refs.resetPasswordCancel?.addEventListener("click", () => {
    closeResetPasswordDialog();
  });

  refs.resetPasswordDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeResetPasswordDialog();
  });

  refs.resetPasswordForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitResetPasswordDialog();
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        // Non-fatal for app usage.
      });
    });
  }

  syncAuthModeUI();
  syncDueToggleUI();
  syncAddButtonUI();
  syncProfilePreferencesUI();
  syncDeveloperToolsUI();
  syncSideCalendarUI();
  syncTasksContentLayout();

  const authActions = consumeAuthActionQueryParams();
  state.useLocalStorageMode = await resolveStorageMode();
  syncAuthUI();

  if (state.useLocalStorageMode) {
    stopAutoSyncLoop();
    state.tasks = loadLocalModeTasks();
    saveLocalModeTasks();
    setStatus("Debug mode enabled. Tasks are stored only on this device.", "warn");
    if (authActions.verifyEmailToken || authActions.resetPasswordToken) {
      setAuthStatus("Auth action links are unavailable in local debug mode.", "warn");
    }
    render();
    return;
  }

  await bootstrapAuthenticatedSession();
  await handleAuthActionParams(authActions);
}

async function bootstrapAuthenticatedSession() {
  try {
    const session = await apiGetSession();
    if (!session.authenticated || !session.user) {
      requireSignIn();
      return;
    }

    state.sessionUser = session.user;
    if (requiresEmailVerificationGate()) {
      state.showVerifySentPage = true;
      state.postRegisterEmail = state.sessionUser.email || "";
      state.postRegisterVerificationEmailSent = true;
      state.tasks = [];
      stopAutoSyncLoop();
      clearStatus();
      clearAuthStatus();
      syncAuthUI();
      setAuthVerifySentStatus("Verify your email before using duee.", "warn");
      render();
      return;
    }

    ensureAutoSyncLoop();
    await refreshPrefsFromServer();
    clearAuthStatus();
    syncAuthUI();
    await loadTasksForCurrentUser();
  } catch (error) {
    requireSignIn(error.message || "Could not verify your session.", "error");
  }
}

function consumeAuthActionQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const verifyEmailToken = sanitizeAuthActionToken(params.get("verify_email_token"));
  const resetPasswordToken = sanitizeAuthActionToken(params.get("reset_password_token"));

  if (!verifyEmailToken && !resetPasswordToken) {
    return {
      verifyEmailToken: "",
      resetPasswordToken: "",
    };
  }

  params.delete("verify_email_token");
  params.delete("reset_password_token");
  const nextQuery = params.toString();
  const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash || ""}`;
  window.history.replaceState({}, "", nextUrl);

  return {
    verifyEmailToken,
    resetPasswordToken,
  };
}

async function handleAuthActionParams(actions) {
  if (!actions) {
    return;
  }

  if (actions.verifyEmailToken) {
    await verifyEmailTokenFromLink(actions.verifyEmailToken);
  }

  if (actions.resetPasswordToken) {
    openResetPasswordDialog(actions.resetPasswordToken);
  }
}

async function verifyEmailTokenFromLink(token) {
  if (!token || state.useLocalStorageMode) {
    return;
  }

  setAuthRequestInFlight(true);
  try {
    const payload = await apiVerifyEmailToken(token);
    const verifiedEmail = payload.user?.email
      || state.sessionUser?.email
      || state.postRegisterEmail
      || refs.authEmail?.value.trim()
      || "";

    if (payload.user) {
      state.sessionUser = payload.user;
    }

    try {
      await apiLogout();
    } catch {
      // Best effort; still continue to sign-in screen.
    }

    requireSignIn();
    state.authMode = "login";
    saveAuthMode();
    syncAuthModeUI();
    if (refs.authEmail && verifiedEmail) {
      refs.authEmail.value = verifiedEmail;
    }
    refs.authPassword?.focus();
    setAuthStatus(
      payload.alreadyVerified
        ? "Email already verified. Sign in to continue."
        : "Email verified. Sign in to continue.",
      "info",
      { persistToast: true }
    );
  } catch (error) {
    setAuthStatus(error.message || "Could not verify your email link.", "error");
  } finally {
    setAuthRequestInFlight(false);
  }
}

function requiresEmailVerificationGate() {
  return Boolean(
    !state.useLocalStorageMode
    && state.sessionUser
    && !state.sessionUser.emailVerified
  );
}

async function loadTasksForCurrentUser() {
  if (!state.sessionUser || requiresEmailVerificationGate()) {
    state.tasks = [];
    render();
    return;
  }

  const cachedTasks = loadTasksCache(state.sessionUser.id);
  if (cachedTasks.length > 0) {
    state.tasks = cachedTasks;
    render();
  } else {
    state.tasks = [];
    render();
  }

  await refreshTasks();
}

async function submitAuth() {
  if (state.authRequestInFlight || state.useLocalStorageMode) {
    return;
  }

  const registerMode = state.authMode === "register";
  const displayName = refs.authDisplayName?.value.trim() || "";
  const email = refs.authEmail.value.trim();
  const password = refs.authPassword.value;

  if (registerMode && !displayName) {
    setAuthStatus("Display name is required.", "error");
    refs.authDisplayName?.focus();
    return;
  }

  if (!email || !password) {
    setAuthStatus("Email and password are required.", "error");
    return;
  }

  setAuthRequestInFlight(true);
  clearAuthStatus();

  try {
    const payload = registerMode
      ? await apiRegister(email, password, displayName)
      : await apiLogin(email, password);

    if (registerMode) {
      state.authMode = "login";
      saveAuthMode();
      refs.authPassword.value = "";
      if (refs.authDisplayName) {
        refs.authDisplayName.value = "";
      }
      syncAuthModeUI();
      showVerifySentPageForEmail(payload.email, payload.verificationEmailSent);
      return;
    }

    if (!payload.user) {
      throw new Error("Sign-in response was invalid.");
    }

    state.sessionUser = payload.user;
    if (requiresEmailVerificationGate()) {
      state.showVerifySentPage = true;
      state.postRegisterEmail = state.sessionUser.email || email;
      state.postRegisterVerificationEmailSent = true;
      state.currentView = "tasks";
      state.authMode = "login";
      saveAuthMode();
      if (refs.authDisplayName) {
        refs.authDisplayName.value = "";
      }
      refs.authPassword.value = "";
      stopAutoSyncLoop();
      state.tasks = [];
      syncAuthModeUI();
      syncAuthUI();
      clearStatus();
      clearAuthStatus();
      setAuthVerifySentStatus("Verify your email before using duee.", "warn");
      render();
      return;
    }

    state.showVerifySentPage = false;
    state.postRegisterEmail = "";
    state.postRegisterVerificationEmailSent = true;
    ensureAutoSyncLoop();
    await refreshPrefsFromServer();
    state.currentView = "tasks";
    state.authMode = "login";
    saveAuthMode();
    if (refs.authDisplayName) {
      refs.authDisplayName.value = "";
    }
    refs.authPassword.value = "";

    syncAuthModeUI();
    syncAuthUI();
    clearStatus();
    clearAuthStatus();

    await loadTasksForCurrentUser();
  } catch (error) {
    setAuthStatus(error.message || "Could not sign in.", "error");
  } finally {
    setAuthRequestInFlight(false);
  }
}

async function logoutCurrentUser() {
  if (state.useLocalStorageMode || state.authRequestInFlight) {
    return;
  }

  setAuthRequestInFlight(true);
  try {
    await apiLogout();
  } catch {
    // Best effort sign out.
  } finally {
    setAuthRequestInFlight(false);
  }

  requireSignIn("Signed out.", "info");
}

function requireSignIn(message = "", type = "info") {
  stopAutoSyncLoop();
  state.sessionUser = null;
  state.currentView = "tasks";
  state.showVerifySentPage = false;
  state.postRegisterEmail = "";
  state.postRegisterVerificationEmailSent = true;
  state.profileEditing = false;
  state.prefsSyncInFlight = false;
  state.prefsSyncPending = false;
  state.sideCalendarSelectedIso = null;
  state.tasks = [];
  state.pendingTaskMutationIds.clear();
  state.recentlyCompletedTaskIds.clear();
  state.editingTaskId = null;
  setRequestInFlight(false);
  setProfileRequestInFlight(false);
  clearProfileStatus();
  clearDeveloperStatus();
  clearAuthVerifySentStatus();
  syncAuthUI();
  render();

  if (message) {
    setAuthStatus(message, type);
  } else {
    clearAuthStatus();
  }
}

function canRunAutoSyncNow() {
  return (
    !state.useLocalStorageMode
    && Boolean(state.sessionUser)
    && !requiresEmailVerificationGate()
    && !state.requestInFlight
    && !state.authRequestInFlight
    && !state.profileRequestInFlight
    && !state.prefsSyncInFlight
    && state.pendingTaskMutationIds.size === 0
  );
}

function ensureAutoSyncLoop() {
  if (state.useLocalStorageMode || !state.sessionUser) {
    stopAutoSyncLoop();
    return;
  }

  if (state.autoSyncTimerId !== null) {
    return;
  }

  state.autoSyncTimerId = window.setInterval(() => {
    triggerAutoSync("interval");
  }, AUTO_SYNC_INTERVAL_MS);
}

function stopAutoSyncLoop() {
  if (state.autoSyncTimerId !== null) {
    clearInterval(state.autoSyncTimerId);
    state.autoSyncTimerId = null;
  }
  state.autoSyncInFlight = false;
}

async function triggerAutoSync(reason = "interval") {
  if (document.hidden) {
    return;
  }

  if (!canRunAutoSyncNow() || state.autoSyncInFlight) {
    return;
  }

  const now = Date.now();
  if (now - state.lastAutoSyncAt < AUTO_SYNC_MIN_GAP_MS) {
    return;
  }

  state.autoSyncInFlight = true;
  state.lastAutoSyncAt = now;

  try {
    await refreshTasks({ silent: true, reason });
  } finally {
    state.autoSyncInFlight = false;
  }
}

async function refreshTasks(options = {}) {
  const silent = Boolean(options.silent);
  if (state.useLocalStorageMode || !state.sessionUser || requiresEmailVerificationGate()) {
    return;
  }

  if (silent && !canRunAutoSyncNow()) {
    return;
  }

  const cachedSnapshot = [...state.tasks];
  if (!silent) {
    setRequestInFlight(true);
  }
  try {
    const remoteTasks = await apiGetTasks();

    if (!silent && remoteTasks.length === 0 && cachedSnapshot.length > 0) {
      const migratedTasks = await migrateCachedTasks(cachedSnapshot);
      state.tasks = migratedTasks;
      saveTasksCache();
      setStatus("Imported your cached tasks to the server.", "info");
      render();
      return;
    }

    state.tasks = remoteTasks;
    saveTasksCache();
    if (!silent) {
      clearStatus();
    }
    render();
  } catch (error) {
    if (handleUnauthorizedError(error)) {
      return;
    }

    if (!silent) {
      if (state.tasks.length > 0) {
        setStatus("Showing cached tasks. Server is unreachable right now.", "warn", { retry: true });
      } else {
        setStatus(error.message || "Could not load tasks from server.", "error", { retry: true });
      }
      render();
    }
  } finally {
    if (!silent) {
      setRequestInFlight(false);
    }
  }
}

async function addTaskFromDraft() {
  if (state.useLocalStorageMode) {
    const text = refs.taskInput.value.trim();
    if (!text) {
      refs.taskInput.focus();
      return;
    }

    state.tasks.push({
      id: createId(),
      text,
      hasDueDate: state.draftHasDueDate,
      dueDate: state.draftHasDueDate ? normalizedDraftDate(refs.dueDateInput.value) : null,
      isCompleted: false,
      createdAt: new Date().toISOString(),
      completedAt: null,
    });

    saveLocalModeTasks();
    refs.taskInput.value = "";
    refs.taskInput.focus();
    render();
    syncAddButtonUI();
    return;
  }

  if (!state.sessionUser) {
    requireSignIn("Please sign in to add tasks.", "warn");
    return;
  }

  if (state.requestInFlight) {
    return;
  }

  const text = refs.taskInput.value.trim();
  if (!text) {
    refs.taskInput.focus();
    return;
  }

  const optimisticId = `pending-${createId()}`;
  const optimisticTask = {
    id: optimisticId,
    text,
    hasDueDate: state.draftHasDueDate,
    dueDate: state.draftHasDueDate ? normalizedDraftDate(refs.dueDateInput.value) : null,
    isCompleted: false,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };

  state.tasks.push(optimisticTask);
  saveTasksCache();
  refs.taskInput.value = "";
  refs.taskInput.focus();
  clearStatus();
  render();
  syncAddButtonUI();

  setRequestInFlight(true);
  try {
    const createdTask = await apiCreateTask({
      text,
      hasDueDate: state.draftHasDueDate,
      dueDate: state.draftHasDueDate ? normalizedDraftDate(refs.dueDateInput.value) : null,
    });
    const optimisticIndex = state.tasks.findIndex((item) => item.id === optimisticId);
    if (optimisticIndex >= 0) {
      state.tasks[optimisticIndex] = createdTask;
    } else {
      state.tasks.push(createdTask);
    }
    saveTasksCache();
    clearStatus();
    render();
  } catch (error) {
    state.tasks = state.tasks.filter((item) => item.id !== optimisticId);
    saveTasksCache();
    render();

    if (handleUnauthorizedError(error)) {
      return;
    }

    setStatus(error.message || "Could not add task. Retry sync, then try again.", "error", { retry: true });
  } finally {
    setRequestInFlight(false);
    syncAddButtonUI();
  }
}

function onTaskAction(event) {
  const card = event.target.closest(".task-card");
  if (!card) {
    return;
  }

  const { id } = card.dataset;
  if (!id) {
    return;
  }

  const actionButton = event.target.closest("button[data-action]");
  if (!actionButton) {
    if (event.target.closest(".task-actions")) {
      return;
    }
    toggleTaskCompletion(id);
    return;
  }

  const action = actionButton.dataset.action;
  if (action === "toggle") {
    toggleTaskCompletion(id);
    return;
  }

  if (action === "edit") {
    openEditDialog(id);
    return;
  }

  if (action === "remove") {
    removeTask(id);
  }
}

async function toggleTaskCompletion(id) {
  if (state.useLocalStorageMode) {
    const task = state.tasks.find((item) => item.id === id);
    if (!task) {
      return;
    }
    task.isCompleted = !task.isCompleted;
    task.completedAt = task.isCompleted ? new Date().toISOString() : null;
    if (task.isCompleted) {
      markTaskRecentlyCompleted(task.id);
    } else {
      state.recentlyCompletedTaskIds.delete(task.id);
    }
    saveLocalModeTasks();
    render();
    return;
  }

  if (!state.sessionUser) {
    requireSignIn("Please sign in to manage tasks.", "warn");
    return;
  }

  if (state.pendingTaskMutationIds.has(id)) {
    return;
  }

  const task = state.tasks.find((item) => item.id === id);
  if (!task) {
    return;
  }

  const previousState = {
    isCompleted: task.isCompleted,
    completedAt: task.completedAt,
  };
  const nextCompleted = !task.isCompleted;

  task.isCompleted = nextCompleted;
  task.completedAt = nextCompleted ? new Date().toISOString() : null;
  if (nextCompleted) {
    markTaskRecentlyCompleted(task.id);
  } else {
    state.recentlyCompletedTaskIds.delete(task.id);
  }
  state.pendingTaskMutationIds.add(id);
  saveTasksCache();
  clearStatus();
  render();

  try {
    const updated = await apiUpdateTask(id, { isCompleted: nextCompleted });
    replaceTask(updated);
    saveTasksCache();
    clearStatus();
  } catch (error) {
    if (handleUnauthorizedError(error)) {
      return;
    }

    task.isCompleted = previousState.isCompleted;
    task.completedAt = previousState.completedAt;
    saveTasksCache();
    setStatus(error.message || "Could not update task. Retry sync and try again.", "error", { retry: true });
  } finally {
    state.pendingTaskMutationIds.delete(id);
    render();
  }
}

async function removeTask(id) {
  if (state.useLocalStorageMode) {
    const task = state.tasks.find((item) => item.id === id);
    if (!task) {
      return;
    }

    const confirmed = await confirmTaskDeletion(task);
    if (!confirmed) {
      return;
    }

    state.tasks = state.tasks.filter((item) => item.id !== id);
    saveLocalModeTasks();
    render();
    return;
  }

  if (!state.sessionUser) {
    requireSignIn("Please sign in to manage tasks.", "warn");
    return;
  }

  if (state.requestInFlight) {
    return;
  }

  const task = state.tasks.find((item) => item.id === id);
  if (!task) {
    return;
  }

  const confirmed = await confirmTaskDeletion(task);
  if (!confirmed) {
    return;
  }

  const index = state.tasks.findIndex((item) => item.id === id);
  if (index < 0) {
    return;
  }

  const removedTask = state.tasks[index];
  state.tasks.splice(index, 1);
  saveTasksCache();
  clearStatus();
  render();

  setRequestInFlight(true);
  try {
    await apiDeleteTask(id);
    saveTasksCache();
    clearStatus();
    render();
  } catch (error) {
    if (handleUnauthorizedError(error)) {
      return;
    }

    state.tasks.splice(index, 0, removedTask);
    saveTasksCache();
    render();
    setStatus(error.message || "Could not delete task. Retry sync and try again.", "error", { retry: true });
  } finally {
    setRequestInFlight(false);
  }
}

function openEditDialog(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) {
    return;
  }

  state.editingTaskId = id;
  refs.editTaskInput.value = task.text;
  state.editHasDueDate = Boolean(task.hasDueDate);
  refs.editDueDateInput.value = task.hasDueDate ? normalizedDraftDate(task.dueDate) : "";
  syncEditDueToggleUI();

  const opened = openDialogElement(refs.editDialog);
  if (!opened) {
    setStatus("Edit dialog is unavailable in this browser.", "error");
  }
}

function closeEditDialog() {
  closeDialogElement(refs.editDialog);
  state.editingTaskId = null;
}

async function confirmTaskDeletion(task) {
  const requiresConfirmation = Boolean(state.prefs.confirmDeletes);
  if (!requiresConfirmation) {
    return true;
  }

  if (!refs.deleteTaskDialog || !refs.deleteTaskPrompt) {
    return true;
  }

  if (state.pendingTaskDeleteResolver) {
    state.pendingTaskDeleteResolver(false);
    state.pendingTaskDeleteResolver = null;
  }

  refs.deleteTaskPrompt.textContent = `Delete "${task.text}"?`;
  const opened = openDialogElement(refs.deleteTaskDialog);
  if (!opened) {
    return true;
  }

  return await new Promise((resolve) => {
    state.pendingTaskDeleteResolver = resolve;
  });
}

function resolveTaskDeletePrompt(confirmed) {
  if (!state.pendingTaskDeleteResolver) {
    return;
  }

  const resolve = state.pendingTaskDeleteResolver;
  state.pendingTaskDeleteResolver = null;
  closeDialogElement(refs.deleteTaskDialog);
  resolve(Boolean(confirmed));
}

async function requestDeleteAccountCredentials() {
  if (!refs.deleteAccountDialog || !refs.deleteAccountForm) {
    return null;
  }

  if (state.pendingDeleteAccountResolver) {
    state.pendingDeleteAccountResolver(null);
    state.pendingDeleteAccountResolver = null;
  }

  if (refs.deleteAccountConfirmInput) {
    refs.deleteAccountConfirmInput.value = "";
  }
  if (refs.deleteAccountPasswordInput) {
    refs.deleteAccountPasswordInput.value = "";
  }
  setDeleteAccountDialogStatus("", "info");

  const opened = openDialogElement(refs.deleteAccountDialog);
  if (!opened) {
    return null;
  }

  queueMicrotask(() => {
    refs.deleteAccountConfirmInput?.focus();
  });

  return await new Promise((resolve) => {
    state.pendingDeleteAccountResolver = resolve;
  });
}

function submitDeleteAccountDialog() {
  if (!refs.deleteAccountConfirmInput || !refs.deleteAccountPasswordInput) {
    resolveDeleteAccountPrompt(null);
    return;
  }

  const confirmText = refs.deleteAccountConfirmInput.value.trim().toUpperCase();
  const password = refs.deleteAccountPasswordInput.value;

  if (confirmText !== DELETE_ACCOUNT_CONFIRMATION_TOKEN) {
    setDeleteAccountDialogStatus("Type DELETE exactly to confirm account deletion.", "warn");
    refs.deleteAccountConfirmInput.focus();
    return;
  }

  if (!password) {
    setDeleteAccountDialogStatus("Password is required.", "warn");
    refs.deleteAccountPasswordInput.focus();
    return;
  }

  resolveDeleteAccountPrompt({ password });
}

function resolveDeleteAccountPrompt(payload) {
  if (!state.pendingDeleteAccountResolver) {
    return;
  }

  const resolve = state.pendingDeleteAccountResolver;
  state.pendingDeleteAccountResolver = null;
  closeDialogElement(refs.deleteAccountDialog);
  resolve(payload);
}

function setDeleteAccountDialogStatus(message, type = "info") {
  syncInlineStatus(refs.deleteAccountDialogStatus, message, type, { renderInline: true });
}

function openForgotPasswordDialog() {
  if (state.useLocalStorageMode || state.authRequestInFlight) {
    return;
  }

  if (!refs.forgotPasswordDialog || !refs.forgotPasswordForm || !refs.forgotPasswordEmailInput) {
    return;
  }

  refs.forgotPasswordEmailInput.value = refs.authEmail?.value.trim() || "";
  setForgotPasswordDialogStatus("", "info");

  const opened = openDialogElement(refs.forgotPasswordDialog);
  if (!opened) {
    setAuthStatus("Password reset dialog is unavailable in this browser.", "error");
    return;
  }

  queueMicrotask(() => {
    refs.forgotPasswordEmailInput?.focus();
  });
}

async function submitForgotPasswordDialog() {
  if (!refs.forgotPasswordEmailInput) {
    return;
  }

  const email = refs.forgotPasswordEmailInput.value.trim();
  if (!email) {
    setForgotPasswordDialogStatus("Email is required.", "warn");
    refs.forgotPasswordEmailInput.focus();
    return;
  }

  setAuthRequestInFlight(true);
  setForgotPasswordDialogStatus("", "info");
  try {
    await apiRequestPasswordReset(email);
    closeDialogElement(refs.forgotPasswordDialog);
    setAuthStatus("If that account exists, a reset link has been sent.", "info");
  } catch (error) {
    setForgotPasswordDialogStatus(error.message || "Could not send reset email.", "error");
  } finally {
    setAuthRequestInFlight(false);
  }
}

function showVerifySentPageForEmail(email, verificationEmailSent = true) {
  if (state.useLocalStorageMode) {
    return;
  }

  const normalizedEmail = typeof email === "string" ? email.trim() : "";
  const emailSent = verificationEmailSent !== false;
  state.showVerifySentPage = true;
  state.postRegisterEmail = normalizedEmail;
  state.postRegisterVerificationEmailSent = emailSent;
  if (refs.authEmail && normalizedEmail) {
    refs.authEmail.value = normalizedEmail;
  }
  clearAuthStatus();
  setAuthVerifySentStatus("", "info");
  syncAuthUI();
  if (!emailSent) {
    setAuthVerifySentStatus(
      "Account created, but the verification email could not be sent. Resend it now.",
      "warn"
    );
    return;
  }
  setAuthVerifySentStatus("Verification email sent. Check your inbox to continue.", "info");
}

function showSignInAfterVerificationPrompt() {
  if (requiresEmailVerificationGate()) {
    return;
  }

  state.showVerifySentPage = false;
  clearAuthVerifySentStatus();
  syncAuthUI();
  refs.authPassword?.focus();
}

async function resendVerificationFromVerifySentPage() {
  if (state.useLocalStorageMode || state.authRequestInFlight) {
    return;
  }

  const email = state.sessionUser?.email || state.postRegisterEmail || refs.authEmail?.value.trim() || "";
  if (!email) {
    setAuthVerifySentStatus("We need your email to resend verification.", "warn");
    if (!requiresEmailVerificationGate()) {
      showSignInAfterVerificationPrompt();
      refs.authEmail?.focus();
    }
    return;
  }

  setAuthRequestInFlight(true);
  state.postRegisterEmail = email;
  clearAuthVerifySentStatus();
  try {
    if (requiresEmailVerificationGate()) {
      const payload = await apiResendEmailVerification();
      if (payload.alreadyVerified && state.sessionUser) {
        state.sessionUser.emailVerified = true;
        state.sessionUser.emailVerifiedAt = state.sessionUser.emailVerifiedAt || new Date().toISOString();
        state.showVerifySentPage = false;
        state.postRegisterEmail = "";
        state.postRegisterVerificationEmailSent = true;
        clearAuthVerifySentStatus();
        syncAuthUI();
        ensureAutoSyncLoop();
        await refreshPrefsFromServer();
        await loadTasksForCurrentUser();
        setAuthStatus("Email is already verified. You can continue.", "info");
        return;
      }
    } else {
      await apiResendEmailVerificationByEmail(email);
    }

    state.postRegisterVerificationEmailSent = true;
    syncVerifySentPageUI();
    setAuthVerifySentStatus("Verification email sent. Check your inbox.", "info");
  } catch (error) {
    setAuthVerifySentStatus(error.message || "Could not resend verification email.", "error");
  } finally {
    setAuthRequestInFlight(false);
  }
}

function syncVerifySentPageUI() {
  if (!refs.authVerifySentMessage) {
    return;
  }

  const signedInUnverified = requiresEmailVerificationGate();
  const email = state.sessionUser?.email || state.postRegisterEmail || refs.authEmail?.value.trim() || "";
  if (refs.authVerifySentTitle) {
    refs.authVerifySentTitle.textContent = signedInUnverified
      ? "Verify your email to continue"
      : "Check your email";
  }
  if (refs.authVerifySentSignInButton) {
    refs.authVerifySentSignInButton.hidden = signedInUnverified;
  }
  if (refs.authVerifySentDeleteButton) {
    refs.authVerifySentDeleteButton.hidden = !signedInUnverified;
    refs.authVerifySentDeleteButton.disabled = state.authRequestInFlight || state.profileRequestInFlight;
  }

  if (!state.postRegisterVerificationEmailSent) {
    refs.authVerifySentMessage.textContent = email
      ? `Your account for ${email} was created, but verification email delivery failed. Resend it below to continue.`
      : "Your account was created, but verification email delivery failed. Resend it below to continue.";
    return;
  }

  if (signedInUnverified) {
    refs.authVerifySentMessage.textContent = email
      ? `You are signed in as ${email}. Verify your email address before you can use duee.`
      : "You are signed in, but your email is not verified. Verify your email before you can use duee.";
    return;
  }

  refs.authVerifySentMessage.textContent = email
    ? `A verification link has been sent to ${email}. Verify your email, then sign in to start using duee.`
    : "A verification link has been sent. Verify your email, then sign in to start using duee.";
}

function setForgotPasswordDialogStatus(message, type = "info") {
  syncInlineStatus(refs.forgotPasswordDialogStatus, message, type, { renderInline: true });
}

function openResetPasswordDialog(token) {
  if (!token || !refs.resetPasswordDialog || !refs.resetPasswordForm) {
    return;
  }

  state.pendingResetPasswordToken = token;
  if (refs.resetPasswordInput) {
    refs.resetPasswordInput.value = "";
  }
  if (refs.resetPasswordConfirmInput) {
    refs.resetPasswordConfirmInput.value = "";
  }
  setResetPasswordDialogStatus("", "info");

  const opened = openDialogElement(refs.resetPasswordDialog);
  if (!opened) {
    state.pendingResetPasswordToken = "";
    setAuthStatus("Password reset dialog is unavailable in this browser.", "error");
    return;
  }

  queueMicrotask(() => {
    refs.resetPasswordInput?.focus();
  });
}

function closeResetPasswordDialog() {
  state.pendingResetPasswordToken = "";
  closeDialogElement(refs.resetPasswordDialog);
  setResetPasswordDialogStatus("", "info");
}

async function submitResetPasswordDialog() {
  if (!state.pendingResetPasswordToken || !refs.resetPasswordInput || !refs.resetPasswordConfirmInput) {
    closeResetPasswordDialog();
    return;
  }

  const password = refs.resetPasswordInput.value;
  const confirm = refs.resetPasswordConfirmInput.value;

  if (!password) {
    setResetPasswordDialogStatus("New password is required.", "warn");
    refs.resetPasswordInput.focus();
    return;
  }

  if (password.length < 8) {
    setResetPasswordDialogStatus("Password must be at least 8 characters.", "warn");
    refs.resetPasswordInput.focus();
    return;
  }

  if (password !== confirm) {
    setResetPasswordDialogStatus("Passwords do not match.", "warn");
    refs.resetPasswordConfirmInput.focus();
    return;
  }

  setAuthRequestInFlight(true);
  setResetPasswordDialogStatus("", "info");
  try {
    await apiConfirmPasswordReset(state.pendingResetPasswordToken, password);
    closeResetPasswordDialog();
    state.authMode = "login";
    saveAuthMode();
    syncAuthModeUI();
    requireSignIn("Password updated. Sign in with your new password.", "info");
    refs.authEmail?.focus();
  } catch (error) {
    setResetPasswordDialogStatus(error.message || "Could not reset password.", "error");
  } finally {
    setAuthRequestInFlight(false);
  }
}

function setResetPasswordDialogStatus(message, type = "info") {
  syncInlineStatus(refs.resetPasswordDialogStatus, message, type, { renderInline: true });
}

function openDialogElement(dialog) {
  if (!dialog) {
    return false;
  }

  if (typeof dialog.showModal === "function") {
    if (!dialog.open) {
      dialog.showModal();
    }
    return true;
  }

  dialog.setAttribute("open", "");
  dialog.dataset.fallbackOpen = "true";
  return true;
}

function closeDialogElement(dialog) {
  if (!dialog) {
    return;
  }

  if (typeof dialog.close === "function") {
    if (dialog.open) {
      dialog.close();
    }
    return;
  }

  dialog.removeAttribute("open");
  delete dialog.dataset.fallbackOpen;
}

async function saveEdit() {
  if (state.useLocalStorageMode) {
    if (!state.editingTaskId) {
      return;
    }

    const task = state.tasks.find((item) => item.id === state.editingTaskId);
    if (!task) {
      closeEditDialog();
      return;
    }

    const nextText = refs.editTaskInput.value.trim();
    if (!nextText) {
      refs.editTaskInput.focus();
      return;
    }

    task.text = nextText;
    task.hasDueDate = state.editHasDueDate;
    task.dueDate = state.editHasDueDate ? normalizedDraftDate(refs.editDueDateInput.value) : null;
    saveLocalModeTasks();
    closeEditDialog();
    render();
    return;
  }

  if (!state.sessionUser) {
    requireSignIn("Please sign in to edit tasks.", "warn");
    return;
  }

  if (!state.editingTaskId || state.requestInFlight) {
    return;
  }

  const taskId = state.editingTaskId;
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) {
    closeEditDialog();
    return;
  }

  const nextText = refs.editTaskInput.value.trim();
  if (!nextText) {
    refs.editTaskInput.focus();
    return;
  }

  const previousState = {
    text: task.text,
    hasDueDate: task.hasDueDate,
    dueDate: task.dueDate,
  };

  task.text = nextText;
  task.hasDueDate = state.editHasDueDate;
  task.dueDate = state.editHasDueDate ? normalizedDraftDate(refs.editDueDateInput.value) : null;
  saveTasksCache();
  clearStatus();
  closeEditDialog();
  render();

  setRequestInFlight(true);
  try {
    const updated = await apiUpdateTask(taskId, {
      text: nextText,
      hasDueDate: state.editHasDueDate,
      dueDate: state.editHasDueDate ? normalizedDraftDate(refs.editDueDateInput.value) : null,
    });
    replaceTask(updated);
    saveTasksCache();
    clearStatus();
    render();
  } catch (error) {
    if (handleUnauthorizedError(error)) {
      return;
    }

    const rollbackTask = state.tasks.find((item) => item.id === taskId);
    if (rollbackTask) {
      rollbackTask.text = previousState.text;
      rollbackTask.hasDueDate = previousState.hasDueDate;
      rollbackTask.dueDate = previousState.dueDate;
    }
    saveTasksCache();
    render();
    setStatus(error.message || "Could not save task changes. Retry sync and try again.", "error", { retry: true });
  } finally {
    setRequestInFlight(false);
  }
}

function render() {
  const activeTasks = state.tasks
    .filter((task) => !task.isCompleted)
    .sort(compareByDueDate);

  const doneTasks = state.tasks
    .filter((task) => task.isCompleted)
    .sort(compareDoneByCompletionNewest);

  refs.activeList.replaceChildren(...activeTasks.map(renderTask));
  refs.doneList.replaceChildren(...doneTasks.map(renderTask));

  refs.emptyUpcoming.hidden = activeTasks.length > 0;
  refs.emptyDone.hidden = doneTasks.length > 0;

  const doneSection = refs.doneList.closest(".stack");
  doneSection.hidden = state.prefs.minimalMode;
  if (refs.tasksMain) {
    refs.tasksMain.classList.toggle("single-stack", doneSection.hidden);
    refs.tasksMain.classList.toggle("prefer-horizontal-layout", Boolean(state.prefs.horizontalTaskSections));
  }
  renderSideCalendar();
  if (state.sideCalendarSelectedIso) {
    showSideCalendarDetails(state.sideCalendarSelectedIso, { showEmpty: true });
  }

}

function renderTask(task) {
  const fragment = refs.taskTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".task-card");
  const toggle = fragment.querySelector(".toggle");
  const text = fragment.querySelector(".task-text");
  const meta = fragment.querySelector(".task-meta");

  card.dataset.id = task.id;
  card.classList.toggle("done", task.isCompleted);
  card.classList.toggle("task-card--just-done", state.recentlyCompletedTaskIds.has(task.id));

  text.textContent = task.text;
  const due = dueLabel(task);
  meta.textContent = due.text;
  meta.classList.toggle("overdue", due.overdue);
  card.classList.toggle("due-today", due.today && !task.isCompleted);

  toggle.setAttribute(
    "aria-label",
    task.isCompleted ? `Restore ${task.text}` : `Mark ${task.text} complete`
  );
  toggle.disabled = state.pendingTaskMutationIds.has(task.id);

  const editButton = fragment.querySelector("[data-action='edit']");
  const removeButton = fragment.querySelector("[data-action='remove']");
  const disableTaskActions = state.requestInFlight || state.pendingTaskMutationIds.has(task.id);
  editButton.disabled = disableTaskActions;
  removeButton.disabled = disableTaskActions;

  return fragment;
}

function dueLabel(task) {
  if (!task.hasDueDate || !task.dueDate) {
    return { text: "no due date", overdue: false, today: false };
  }

  const dueDate = fromIsoDay(task.dueDate);
  const dateText = dueDate.toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
  });

  if (task.isCompleted) {
    return { text: `due ${dateText}`, overdue: false, today: false };
  }

  const delta = dayDelta(task.dueDate);
  if (delta === 0) {
    return { text: `due ${dateText} · today`, overdue: false, today: true };
  }

  if (delta > 0) {
    const dayWord = delta === 1 ? "day" : "days";
    return { text: `due ${dateText} · in ${delta} ${dayWord}`, overdue: false, today: false };
  }

  const late = Math.abs(delta);
  const dayWord = late === 1 ? "day" : "days";
  return { text: `due ${dateText} · ${late} ${dayWord} late`, overdue: true, today: false };
}

function compareByDueDate(lhs, rhs) {
  if (Boolean(lhs.hasDueDate) !== Boolean(rhs.hasDueDate)) {
    return lhs.hasDueDate ? -1 : 1;
  }

  if (!lhs.hasDueDate || !rhs.hasDueDate) {
    return new Date(lhs.createdAt).getTime() - new Date(rhs.createdAt).getTime();
  }

  if (lhs.dueDate !== rhs.dueDate) {
    return fromIsoDay(lhs.dueDate).getTime() - fromIsoDay(rhs.dueDate).getTime();
  }

  return new Date(lhs.createdAt).getTime() - new Date(rhs.createdAt).getTime();
}

function compareDoneByCompletionNewest(lhs, rhs) {
  const rhsTime = completionTimestamp(rhs);
  const lhsTime = completionTimestamp(lhs);
  if (rhsTime !== lhsTime) {
    return rhsTime - lhsTime;
  }

  return compareByDueDate(lhs, rhs);
}

function completionTimestamp(task) {
  const completedAt = Date.parse(task.completedAt || "");
  if (Number.isFinite(completedAt) && completedAt > 0) {
    return completedAt;
  }

  const createdAt = Date.parse(task.createdAt || "");
  if (Number.isFinite(createdAt) && createdAt > 0) {
    return createdAt;
  }

  return 0;
}

function markTaskRecentlyCompleted(taskId) {
  if (!taskId) {
    return;
  }

  state.recentlyCompletedTaskIds.add(taskId);
  window.setTimeout(() => {
    state.recentlyCompletedTaskIds.delete(taskId);
    render();
  }, 260);
}

function replaceTask(updatedTask) {
  const index = state.tasks.findIndex((item) => item.id === updatedTask.id);
  if (index < 0) {
    state.tasks.push(updatedTask);
    return;
  }
  state.tasks[index] = updatedTask;
}

function syncAuthUI() {
  const signedIn = Boolean(state.sessionUser);
  const requiresVerification = requiresEmailVerificationGate();
  if (!signedIn || requiresVerification) {
    state.currentView = "tasks";
  }

  const showAuthGate = !state.useLocalStorageMode && !signedIn;
  const showVerifySentPage = !state.useLocalStorageMode
    && (requiresVerification || (!signedIn && state.showVerifySentPage));
  const showTasks = state.useLocalStorageMode || (signedIn && !requiresVerification);
  const showProfile = !state.useLocalStorageMode && signedIn && !requiresVerification && state.currentView === "profile";

  if (refs.tasksShell) {
    refs.tasksShell.hidden = !showTasks || showProfile;
  }

  if (refs.profilePage) {
    refs.profilePage.hidden = !showProfile;
  }

  if (refs.profileBackButton) {
    refs.profileBackButton.hidden = !showProfile;
  }

  if (refs.accountBar) {
    refs.accountBar.hidden = state.useLocalStorageMode || !signedIn || showVerifySentPage;
  }

  if (refs.accountDisplayName) {
    refs.accountDisplayName.textContent = state.sessionUser?.displayName || "";
  }

  if (refs.accountIdentity) {
    refs.accountIdentity.title = state.sessionUser?.email || "";
    refs.accountIdentity.setAttribute(
      "aria-label",
      signedIn
        ? (requiresVerification ? "Profile is locked until email is verified" : "Open profile settings")
        : "Open profile"
    );
  }

  if (refs.authPanel) {
    refs.authPanel.hidden = !showAuthGate || showVerifySentPage;
  }

  if (refs.authVerifySentPage) {
    refs.authVerifySentPage.hidden = !showVerifySentPage;
  }

  if (showVerifySentPage) {
    syncVerifySentPageUI();
  }

  if (!showTasks || showProfile) {
    closeCalendar();
    if (refs.editDialog.open) {
      closeEditDialog();
    }
  }

  populateProfileForm();
  syncProfileEditUI();
  syncProfilePreferencesUI();
  syncDeveloperToolsUI();
  syncSideCalendarUI();
  syncAccountControlsDisabled();
  syncTasksContentLayout();
}

function openProfilePage() {
  if (
    state.useLocalStorageMode
    || !state.sessionUser
    || requiresEmailVerificationGate()
    || state.authRequestInFlight
  ) {
    return;
  }
  state.currentView = "profile";
  state.profileEditing = false;
  clearProfileStatus();
  clearDeveloperStatus();
  populateProfileForm();
  syncProfileEditUI();
  syncAuthUI();
  refs.profileEditButton?.focus();
}

function openProfileEditPanel() {
  if (state.useLocalStorageMode || !state.sessionUser || state.authRequestInFlight || state.profileRequestInFlight) {
    return;
  }
  state.profileEditing = true;
  clearProfileStatus();
  populateProfileForm();
  syncProfileEditUI();
  refs.profileDisplayNameInput?.focus();
}

function closeProfileEditPanel() {
  if (state.profileRequestInFlight) {
    return;
  }
  state.profileEditing = false;
  clearProfileStatus();
  populateProfileForm();
  syncProfileEditUI();
  refs.profileEditButton?.focus();
}

function openTasksPage({ focusAccount = false, focusMainInput = false } = {}) {
  state.currentView = "tasks";
  clearProfileStatus();
  syncAuthUI();
  if (focusAccount) {
    refs.accountIdentity?.focus();
    return;
  }

  if (focusMainInput && (state.useLocalStorageMode || state.sessionUser)) {
    refs.taskInput?.focus();
  }
}

function populateProfileForm() {
  if (
    !refs.profileDisplayNameValue
    || !refs.profileDisplayNameInput
    || !refs.profileEmail
    || !refs.profileCreatedAt
    || !refs.profileUserId
  ) {
    return;
  }

  const user = state.sessionUser;
  if (!user) {
    refs.profileDisplayNameValue.textContent = "";
    refs.profileDisplayNameInput.value = "";
    refs.profileEmail.textContent = "";
    refs.profileCreatedAt.textContent = "";
    refs.profileUserId.textContent = "";
    syncProfileVerificationUI();
    return;
  }

  const activeElement = document.activeElement;
  if (activeElement !== refs.profileDisplayNameInput || !state.profileEditing) {
    refs.profileDisplayNameInput.value = user.displayName;
  }
  refs.profileDisplayNameValue.textContent = user.displayName;
  refs.profileEmail.textContent = user.email;
  refs.profileCreatedAt.textContent = formatAccountCreatedAt(user.createdAt);
  refs.profileUserId.textContent = user.id;
  syncProfileVerificationUI();
}

function syncProfileEditUI() {
  const disabled = state.authRequestInFlight || state.profileRequestInFlight || !state.sessionUser;
  const editing = state.profileEditing && Boolean(state.sessionUser);

  if (refs.profileDisplayNameEditor) {
    refs.profileDisplayNameEditor.hidden = !editing;
  }
  if (refs.profileDisplayNameValue) {
    refs.profileDisplayNameValue.hidden = editing;
  }
  if (refs.profileEditButton) {
    refs.profileEditButton.disabled = disabled;
  }
  if (refs.profileDisplayNameInput) {
    refs.profileDisplayNameInput.disabled = disabled;
  }
  if (refs.profileCancelEditButton) {
    refs.profileCancelEditButton.disabled = disabled;
  }
  if (refs.profileSaveButton) {
    refs.profileSaveButton.disabled = disabled;
  }
}

function syncProfilePreferencesUI() {
  const disabled = state.authRequestInFlight || state.profileRequestInFlight;
  const actionDisabled = disabled || !state.sessionUser || state.useLocalStorageMode;

  syncPreferenceToggle(refs.profileHideDoneToggle, state.prefs.minimalMode, disabled);
  syncPreferenceToggle(refs.profileReceiveUpdatesToggle, state.prefs.receiveUpdates, disabled);
  syncPreferenceToggle(refs.profileConfirmDeleteToggle, state.prefs.confirmDeletes, disabled);
  syncPreferenceToggle(refs.profileHorizontalSectionsToggle, state.prefs.horizontalTaskSections, disabled);
  syncPreferenceToggle(refs.profileSideCalendarToggle, state.prefs.sideCalendarVisible, disabled);

  if (refs.profileExportDataButton) {
    refs.profileExportDataButton.disabled = actionDisabled;
  }
  if (refs.profileDeleteDataButton) {
    refs.profileDeleteDataButton.disabled = actionDisabled;
  }

  syncProfileVerificationUI();
  syncDeveloperToolsUI();
}

function syncProfileVerificationUI() {
  const user = state.sessionUser;

  if (refs.profileEmailVerification) {
    if (!user) {
      refs.profileEmailVerification.textContent = "";
      refs.profileEmailVerification.dataset.type = "info";
    } else if (user.emailVerified) {
      refs.profileEmailVerification.textContent = user.emailVerifiedAt
        ? `Verified ${formatAccountCreatedAt(user.emailVerifiedAt)}`
        : "Email verified.";
      refs.profileEmailVerification.dataset.type = "info";
    } else {
      refs.profileEmailVerification.textContent = "Email not verified yet.";
      refs.profileEmailVerification.dataset.type = "warn";
    }
  }

  if (refs.profileResendVerificationButton) {
    const hidden = !user || state.useLocalStorageMode || Boolean(user?.emailVerified);
    refs.profileResendVerificationButton.hidden = hidden;
    refs.profileResendVerificationButton.disabled = hidden
      || state.authRequestInFlight
      || state.profileRequestInFlight;
  }
}

function syncDeveloperToolsUI() {
  const canUseDeveloperTools = Boolean(state.sessionUser) && !state.useLocalStorageMode;
  const busy = state.authRequestInFlight || state.profileRequestInFlight;
  const disabled = !canUseDeveloperTools || busy;

  if (refs.developerToggleButton) {
    refs.developerToggleButton.hidden = !canUseDeveloperTools;
    refs.developerToggleButton.disabled = busy;
    refs.developerToggleButton.textContent = state.developerToolsOpen
      ? "Hide developer tools"
      : "Show developer tools";
    refs.developerToggleButton.setAttribute("aria-expanded", String(state.developerToolsOpen));
  }

  if (refs.developerPanel) {
    refs.developerPanel.hidden = !canUseDeveloperTools || !state.developerToolsOpen;
  }

  if (refs.developerReplaceImportToggle) {
    refs.developerReplaceImportToggle.disabled = disabled;
  }
  if (refs.developerImportFileInput) {
    refs.developerImportFileInput.disabled = disabled;
  }
  if (refs.developerImportButton) {
    refs.developerImportButton.disabled = disabled;
  }
  if (refs.developerExportTasksButton) {
    refs.developerExportTasksButton.disabled = disabled;
  }
  if (refs.developerClearCompletedButton) {
    refs.developerClearCompletedButton.disabled = disabled;
  }
  if (refs.developerForceSyncButton) {
    refs.developerForceSyncButton.disabled = disabled;
  }
  if (refs.developerExportSnapshotButton) {
    refs.developerExportSnapshotButton.disabled = disabled;
  }
}

function setDeveloperStatus(message, type = "info") {
  syncInlineStatus(refs.developerStatus, message, type, { renderInline: true });
  if (message) {
    showToast("developer", message, type);
    return;
  }
  clearToast("developer");
}

function clearDeveloperStatus() {
  setDeveloperStatus("", "info");
}

function exportTodoListForDeveloper() {
  if (!state.sessionUser || state.useLocalStorageMode || state.authRequestInFlight || state.profileRequestInFlight) {
    return;
  }

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    taskCount: state.tasks.length,
    tasks: state.tasks.map((task) => ({
      text: task.text,
      hasDueDate: Boolean(task.hasDueDate),
      dueDate: task.hasDueDate ? task.dueDate : null,
      isCompleted: Boolean(task.isCompleted),
      createdAt: task.createdAt || null,
      completedAt: task.completedAt || null,
    })),
  };

  downloadJsonFile(payload, `duee-todo-export-${new Date().toISOString().replaceAll(":", "-")}.json`);
  setDeveloperStatus("Todo list exported.", "info");
}

async function importTodoListForDeveloper() {
  if (!state.sessionUser || state.useLocalStorageMode || state.authRequestInFlight || state.profileRequestInFlight) {
    return;
  }

  const importFile = refs.developerImportFileInput?.files?.[0];
  if (!importFile) {
    setDeveloperStatus("Choose a JSON file to import.", "warn");
    return;
  }

  setProfileRequestInFlight(true);
  clearDeveloperStatus();
  try {
    const rawText = await importFile.text();
    const importedTasks = parseImportedTasksForDeveloper(rawText);
    const replace = Boolean(refs.developerReplaceImportToggle?.checked);
    await applyImportedTasksForDeveloper(importedTasks, { replace });
    if (refs.developerImportFileInput) {
      refs.developerImportFileInput.value = "";
    }
    setDeveloperStatus(
      replace
        ? `Imported ${importedTasks.length} tasks and replaced existing tasks.`
        : `Imported ${importedTasks.length} tasks.`,
      "info"
    );
  } catch (error) {
    if (handleUnauthorizedError(error)) {
      return;
    }
    setDeveloperStatus(error.message || "Could not import todo list.", "error");
  } finally {
    setProfileRequestInFlight(false);
  }
}

function parseImportedTasksForDeveloper(rawText) {
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("Import file is not valid JSON.");
  }

  const taskCandidates = Array.isArray(parsed)
    ? parsed
    : (Array.isArray(parsed?.tasks) ? parsed.tasks : null);

  if (!Array.isArray(taskCandidates)) {
    throw new Error("Import file must be a JSON array or an object with a tasks array.");
  }

  const tasks = taskCandidates.map(normalizeTask).filter(Boolean);
  if (tasks.length === 0) {
    throw new Error("Import file does not contain any valid tasks.");
  }

  return tasks;
}

async function applyImportedTasksForDeveloper(importedTasks, { replace }) {
  if (replace) {
    const existingTaskIds = state.tasks.map((task) => task.id);
    for (const taskId of existingTaskIds) {
      await apiDeleteTask(taskId);
    }
    state.tasks = [];
  }

  const createdTasks = [];
  for (const importedTask of importedTasks) {
    const created = await apiCreateTask({
      text: importedTask.text,
      hasDueDate: Boolean(importedTask.hasDueDate),
      dueDate: importedTask.hasDueDate ? normalizedDraftDate(importedTask.dueDate) : null,
    });

    if (importedTask.isCompleted) {
      const completed = await apiUpdateTask(created.id, { isCompleted: true });
      createdTasks.push(completed);
    } else {
      createdTasks.push(created);
    }
  }

  if (replace) {
    state.tasks = createdTasks;
  } else {
    state.tasks = [...state.tasks, ...createdTasks];
  }

  saveTasksCache();
  render();
}

async function clearCompletedTasksForDeveloper() {
  if (!state.sessionUser || state.useLocalStorageMode || state.authRequestInFlight || state.profileRequestInFlight) {
    return;
  }

  const doneTasks = state.tasks.filter((task) => task.isCompleted);
  if (doneTasks.length === 0) {
    setDeveloperStatus("No completed tasks to clear.", "info");
    return;
  }

  setProfileRequestInFlight(true);
  clearDeveloperStatus();
  try {
    for (const task of doneTasks) {
      await apiDeleteTask(task.id);
    }
    state.tasks = state.tasks.filter((task) => !task.isCompleted);
    saveTasksCache();
    render();
    setDeveloperStatus(`Cleared ${doneTasks.length} completed tasks.`, "info");
  } catch (error) {
    if (handleUnauthorizedError(error)) {
      return;
    }
    setDeveloperStatus(error.message || "Could not clear completed tasks.", "error");
  } finally {
    setProfileRequestInFlight(false);
  }
}

async function forceSyncForDeveloper() {
  if (!state.sessionUser || state.useLocalStorageMode || state.authRequestInFlight || state.profileRequestInFlight) {
    return;
  }

  setProfileRequestInFlight(true);
  setDeveloperStatus("Syncing…", "info");
  try {
    const remoteTasks = await apiGetTasks();
    state.tasks = remoteTasks;
    saveTasksCache();
    render();
    setDeveloperStatus("Sync complete.", "info");
  } catch (error) {
    if (handleUnauthorizedError(error)) {
      return;
    }
    setDeveloperStatus(error.message || "Could not sync tasks.", "error");
  } finally {
    setProfileRequestInFlight(false);
  }
}

function exportDebugSnapshotForDeveloper() {
  if (!state.sessionUser || state.useLocalStorageMode || state.authRequestInFlight || state.profileRequestInFlight) {
    return;
  }

  const snapshot = {
    version: 1,
    exportedAt: new Date().toISOString(),
    user: state.sessionUser,
    prefs: state.prefs,
    tasks: state.tasks,
    counts: {
      total: state.tasks.length,
      active: state.tasks.filter((task) => !task.isCompleted).length,
      completed: state.tasks.filter((task) => task.isCompleted).length,
    },
  };

  downloadJsonFile(snapshot, `duee-debug-snapshot-${new Date().toISOString().replaceAll(":", "-")}.json`);
  setDeveloperStatus("Debug snapshot exported.", "info");
}

function syncPreferenceToggle(toggle, checked, disabled) {
  if (!toggle) {
    return;
  }
  toggle.checked = Boolean(checked);
  toggle.disabled = disabled;
  toggle.setAttribute("aria-checked", String(Boolean(checked)));
}

async function saveProfile() {
  if (
    state.useLocalStorageMode
    || !state.sessionUser
    || state.authRequestInFlight
    || state.profileRequestInFlight
  ) {
    return;
  }

  const displayName = refs.profileDisplayNameInput?.value.trim() || "";
  if (!displayName) {
    setProfileStatus("Display name is required.", "error");
    refs.profileDisplayNameInput?.focus();
    return;
  }

  if (displayName.length > 48) {
    setProfileStatus("Display name must be 48 characters or fewer.", "error");
    refs.profileDisplayNameInput?.focus();
    return;
  }

  if (displayName === state.sessionUser.displayName) {
    setProfileStatus("No changes to save.", "info");
    return;
  }

  setProfileRequestInFlight(true);
  clearProfileStatus();

  try {
    const payload = await apiUpdateProfile(displayName);
    if (!payload.user) {
      throw new Error("Profile response was invalid.");
    }
    state.sessionUser = payload.user;
    state.profileEditing = false;
    populateProfileForm();
    syncProfileEditUI();
    syncAuthUI();
    setProfileStatus("Profile updated.", "info");
  } catch (error) {
    if (handleUnauthorizedError(error)) {
      return;
    }
    setProfileStatus(error.message || "Could not update profile.", "error");
  } finally {
    setProfileRequestInFlight(false);
  }
}

async function exportAccountData() {
  if (
    state.useLocalStorageMode
    || !state.sessionUser
    || state.authRequestInFlight
    || state.profileRequestInFlight
  ) {
    return;
  }

  setProfileRequestInFlight(true);
  clearProfileStatus();
  try {
    const response = await fetch(`${API_BASE}/auth/export/download`, {
      method: "GET",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      let message = `Request failed with status ${response.status}.`;
      try {
        const payload = await response.json();
        if (payload?.error) {
          message = payload.error;
        }
      } catch {
        // keep fallback message
      }

      const error = new Error(message);
      error.statusCode = response.status;
      throw error;
    }

    const contentDisposition = response.headers.get("content-disposition") || "";
    const matchedFilename = /filename=\"?([^\";]+)\"?/i.exec(contentDisposition);
    const filename = matchedFilename?.[1] || "duee-account-export.json";
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    link.style.display = "none";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);

    setProfileStatus("Export downloaded.", "info");
  } catch (error) {
    if (handleUnauthorizedError(error)) {
      return;
    }
    setProfileStatus(error.message || "Could not export account data.", "error");
  } finally {
    setProfileRequestInFlight(false);
  }
}

async function deleteAccountData() {
  if (
    state.useLocalStorageMode
    || !state.sessionUser
    || state.authRequestInFlight
    || state.profileRequestInFlight
  ) {
    return;
  }

  const credentials = await requestDeleteAccountCredentials();
  if (!credentials) {
    return;
  }

  const { password } = credentials;

  setProfileRequestInFlight(true);
  clearProfileStatus();
  try {
    await apiDeleteAccount(password);
    requireSignIn("Your account has been deleted.", "info");
  } catch (error) {
    if (handleUnauthorizedError(error)) {
      return;
    }
    setProfileStatus(error.message || "Could not delete account.", "error");
  } finally {
    setProfileRequestInFlight(false);
  }
}

async function resendEmailVerification() {
  if (
    state.useLocalStorageMode
    || !state.sessionUser
    || state.sessionUser.emailVerified
    || state.authRequestInFlight
    || state.profileRequestInFlight
  ) {
    return;
  }

  setProfileRequestInFlight(true);
  clearProfileStatus();
  try {
    const payload = await apiResendEmailVerification();
    if (payload.alreadyVerified) {
      if (state.sessionUser) {
        state.sessionUser.emailVerified = true;
        state.sessionUser.emailVerifiedAt = state.sessionUser.emailVerifiedAt || new Date().toISOString();
      }
      syncProfileVerificationUI();
      setProfileStatus("Email is already verified.", "info");
      return;
    }
    setProfileStatus("Verification email sent.", "info");
  } catch (error) {
    if (handleUnauthorizedError(error)) {
      return;
    }
    setProfileStatus(error.message || "Could not send verification email.", "error");
  } finally {
    setProfileRequestInFlight(false);
  }
}

function syncAuthModeUI() {
  if (
    !refs.authTitle
    || !refs.authSubmit
    || !refs.authSwitchPrefix
    || !refs.authSwitchButton
    || !refs.authHint
    || !refs.authDisplayNameField
    || !refs.authDisplayName
  ) {
    return;
  }

  const registerMode = state.authMode === "register";

  refs.authTitle.textContent = registerMode ? "Create account" : "Sign in";
  refs.authHint.textContent = registerMode
    ? "Create an account, then verify your email before signing in."
    : "Sign in to sync your tasks across devices.";
  refs.authSubmit.textContent = registerMode ? "Create account" : "Sign in";
  refs.authSwitchPrefix.textContent = registerMode ? "Already have an account?" : "Need an account?";
  refs.authSwitchButton.textContent = registerMode ? "Sign in" : "Create account";
  refs.authDisplayNameField.hidden = !registerMode;
  refs.authDisplayName.required = registerMode;
  refs.authDisplayName.disabled = !registerMode;
  if (refs.authForgotRow) {
    refs.authForgotRow.hidden = registerMode;
  }
  if (refs.authForgotPasswordButton) {
    refs.authForgotPasswordButton.disabled = state.authRequestInFlight || registerMode;
  }
  if (!registerMode) {
    refs.authDisplayName.value = "";
  }
  refs.authPassword.setAttribute("autocomplete", registerMode ? "new-password" : "current-password");
}

function setAuthRequestInFlight(value) {
  state.authRequestInFlight = value;

  if (refs.authEmail) {
    refs.authEmail.disabled = value;
  }
  if (refs.authDisplayName) {
    refs.authDisplayName.disabled = value || state.authMode !== "register";
  }
  if (refs.authPassword) {
    refs.authPassword.disabled = value;
  }
  if (refs.authSubmit) {
    refs.authSubmit.disabled = value;
  }
  if (refs.authSwitchButton) {
    refs.authSwitchButton.disabled = value;
  }
  if (refs.authForgotPasswordButton) {
    refs.authForgotPasswordButton.disabled = value || state.authMode === "register";
  }
  if (refs.authVerifySentSignInButton) {
    refs.authVerifySentSignInButton.disabled = value;
  }
  if (refs.authVerifySentResendButton) {
    refs.authVerifySentResendButton.disabled = value;
  }
  if (refs.authVerifySentDeleteButton) {
    refs.authVerifySentDeleteButton.disabled = value || !requiresEmailVerificationGate();
  }
  if (refs.forgotPasswordEmailInput) {
    refs.forgotPasswordEmailInput.disabled = value;
  }
  if (refs.forgotPasswordCancel) {
    refs.forgotPasswordCancel.disabled = value;
  }
  if (refs.forgotPasswordSubmit) {
    refs.forgotPasswordSubmit.disabled = value;
  }
  if (refs.resetPasswordInput) {
    refs.resetPasswordInput.disabled = value;
  }
  if (refs.resetPasswordConfirmInput) {
    refs.resetPasswordConfirmInput.disabled = value;
  }
  if (refs.resetPasswordCancel) {
    refs.resetPasswordCancel.disabled = value;
  }
  if (refs.resetPasswordSubmit) {
    refs.resetPasswordSubmit.disabled = value;
  }
  syncAccountControlsDisabled();
  syncProfileEditUI();
  syncProfilePreferencesUI();
}

function setProfileRequestInFlight(value) {
  state.profileRequestInFlight = value;
  if (refs.profileBackButton) {
    refs.profileBackButton.disabled = value;
  }
  if (refs.deleteAccountConfirmInput) {
    refs.deleteAccountConfirmInput.disabled = value;
  }
  if (refs.deleteAccountPasswordInput) {
    refs.deleteAccountPasswordInput.disabled = value;
  }
  if (refs.deleteAccountCancel) {
    refs.deleteAccountCancel.disabled = value;
  }
  if (refs.deleteAccountConfirm) {
    refs.deleteAccountConfirm.disabled = value;
  }
  if (refs.authVerifySentDeleteButton) {
    refs.authVerifySentDeleteButton.disabled = value || !requiresEmailVerificationGate();
  }
  syncAccountControlsDisabled();
  syncProfileEditUI();
  syncProfilePreferencesUI();
}

function syncAccountControlsDisabled() {
  const disabled = !state.sessionUser || state.authRequestInFlight || state.profileRequestInFlight;
  if (refs.logoutButton) {
    refs.logoutButton.disabled = disabled;
  }
  if (refs.accountIdentity) {
    refs.accountIdentity.disabled = disabled || requiresEmailVerificationGate();
  }
}

function setAuthStatus(message, type = "info", options = {}) {
  syncInlineStatus(refs.authStatus, message, type);
  if (message) {
    showToast("auth", message, type, {
      retry: Boolean(options.retry),
      signIn: Boolean(options.signIn),
      persist: Boolean(options.persistToast),
    });
    return;
  }
  clearToast("auth");
}

function clearAuthStatus() {
  setAuthStatus("", "info");
}

function setAuthVerifySentStatus(message, type = "info") {
  syncInlineStatus(refs.authVerifySentStatus, message, type);
  if (message) {
    showToast("auth-verify-sent", message, type);
    return;
  }
  clearToast("auth-verify-sent");
}

function clearAuthVerifySentStatus() {
  setAuthVerifySentStatus("", "info");
}

function setProfileStatus(message, type = "info") {
  syncInlineStatus(refs.profileStatus, message, type);
  if (message) {
    showToast("profile", message, type);
    return;
  }
  clearToast("profile");
}

function clearProfileStatus() {
  setProfileStatus("", "info");
}

function syncInlineStatus(element, message, type, options = {}) {
  if (!element) {
    return;
  }

  const renderInline = Boolean(options.renderInline);
  const isError = type === "error";
  element.setAttribute("aria-live", isError ? "assertive" : "polite");
  element.setAttribute("role", isError ? "alert" : "status");
  element.hidden = !renderInline || !message;
  element.textContent = message || "";
  element.dataset.type = type;
}

function syncDueToggleUI() {
  refs.dueDateInput.disabled = !state.draftHasDueDate || state.requestInFlight;
  refs.dueDateSelect.disabled = state.requestInFlight;
  refs.dueDateSelect.textContent = state.draftHasDueDate && refs.dueDateInput.value
    ? formatDateSelection(refs.dueDateInput.value)
    : "No date selected";
  refs.dueDateSelect.classList.toggle("is-empty", !state.draftHasDueDate || !refs.dueDateInput.value);
  refs.dueDateToggle.textContent = state.draftHasDueDate ? "No date" : "Use date";
  refs.dueDateToggle.dataset.mode = state.draftHasDueDate ? "clear" : "set";
  refs.dueDateToggle.setAttribute("aria-pressed", String(state.draftHasDueDate));
  refs.dueDateToggle.setAttribute(
    "aria-label",
    state.draftHasDueDate ? "Mark task as no due date" : "Enable due date"
  );
  refs.dueDateToggle.disabled = state.requestInFlight;
}

function syncEditDueToggleUI() {
  refs.editDueDateInput.disabled = !state.editHasDueDate || state.requestInFlight;
  refs.editDueDateSelect.disabled = state.requestInFlight;
  refs.editDueDateSelect.textContent = state.editHasDueDate && refs.editDueDateInput.value
    ? formatDateSelection(refs.editDueDateInput.value)
    : "No date selected";
  refs.editDueDateSelect.classList.toggle("is-empty", !state.editHasDueDate || !refs.editDueDateInput.value);
  refs.editDueToggle.textContent = state.editHasDueDate ? "No date" : "Use date";
  refs.editDueToggle.setAttribute(
    "aria-label",
    state.editHasDueDate ? "Mark task as no due date" : "Enable due date"
  );
  refs.editDueToggle.setAttribute("aria-pressed", String(state.editHasDueDate));
  refs.editDueToggle.disabled = state.requestInFlight;
}

function syncAddButtonUI() {
  refs.addButton.disabled = state.requestInFlight || refs.taskInput.value.trim().length === 0;
}

function setRequestInFlight(value) {
  state.requestInFlight = value;
  refs.taskInput.disabled = value;
  refs.cancelEdit.disabled = value;
  syncAddButtonUI();
  syncDueToggleUI();
  syncEditDueToggleUI();
  // Keep task action buttons in sync with request state.
  render();
}

function syncSideCalendarUI() {
  if (!refs.sideCalendarCard || !refs.sideCalendarBody) {
    return;
  }

  const visible = Boolean(state.prefs.sideCalendarVisible);
  refs.sideCalendarCard.hidden = !visible;
  refs.sideCalendarBody.hidden = !visible;
  if (refs.sideCalendarPrev) {
    refs.sideCalendarPrev.disabled = !visible;
  }
  if (refs.sideCalendarNext) {
    refs.sideCalendarNext.disabled = !visible;
  }

  if (visible) {
    renderSideCalendar();
    if (state.sideCalendarSelectedIso) {
      showSideCalendarDetails(state.sideCalendarSelectedIso, { showEmpty: true });
    }
  } else {
    clearSideCalendarDetails();
  }
  syncTasksContentLayout();
}

function renderSideCalendar() {
  if (!refs.sideCalendarGrid || !refs.sideCalendarMonthLabel || !refs.sideCalendarBody || refs.sideCalendarBody.hidden) {
    return;
  }

  const monthStart = startOfMonth(state.sideCalendarMonth);
  const viewMonth = monthStart.getMonth();
  const todayIso = isoDay(startOfLocalDay(new Date()));
  const gridStart = addDays(monthStart, -monthStart.getDay());

  refs.sideCalendarMonthLabel.textContent = monthStart.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const fragment = document.createDocumentFragment();
  for (let index = 0; index < 42; index += 1) {
    const day = addDays(gridStart, index);
    const dayIso = isoDay(day);
    const dueTasks = getDueTasksByDay(dayIso);
    const dayButton = document.createElement("button");

    dayButton.type = "button";
    dayButton.className = "side-calendar-day";
    dayButton.dataset.iso = dayIso;
    dayButton.setAttribute("role", "gridcell");
    dayButton.setAttribute(
      "aria-label",
      `${day.toLocaleDateString(undefined, { month: "short", day: "numeric", weekday: "short" })}${dueTasks.length > 0 ? `, ${dueTasks.length} tasks due` : ""}`
    );

    if (day.getMonth() !== viewMonth) {
      dayButton.classList.add("is-outside");
    }
    if (dayIso === todayIso) {
      dayButton.classList.add("is-today");
    }
    if (state.sideCalendarSelectedIso && dayIso === state.sideCalendarSelectedIso) {
      dayButton.classList.add("is-selected");
    }
    dayButton.setAttribute("aria-selected", String(dayIso === state.sideCalendarSelectedIso));
    if (dueTasks.length > 0) {
      dayButton.classList.add("has-tasks");
    }

    const dayNumber = document.createElement("span");
    dayNumber.className = "side-calendar-day-number";
    dayNumber.textContent = String(day.getDate());
    dayButton.appendChild(dayNumber);

    if (dueTasks.length > 0) {
      const dotWrap = document.createElement("span");
      dotWrap.className = "side-calendar-dots";
      const dotCount = Math.min(dueTasks.length, 4);
      for (let dotIndex = 0; dotIndex < dotCount; dotIndex += 1) {
        const dot = document.createElement("span");
        dot.className = "side-calendar-dot";
        dotWrap.appendChild(dot);
      }
      if (dueTasks.length > 4) {
        const more = document.createElement("span");
        more.className = "side-calendar-dot-more";
        more.textContent = `+${dueTasks.length - 4}`;
        dotWrap.appendChild(more);
      }
      dayButton.appendChild(dotWrap);
    }

    fragment.appendChild(dayButton);
  }

  refs.sideCalendarGrid.replaceChildren(fragment);
}

function getDueTasksByDay(isoDate) {
  return state.tasks
    .filter((task) => task.hasDueDate && task.dueDate === isoDate)
    .sort((lhs, rhs) => {
      if (lhs.isCompleted !== rhs.isCompleted) {
        return Number(lhs.isCompleted) - Number(rhs.isCompleted);
      }
      return compareByDueDate(lhs, rhs);
    });
}

function showSideCalendarDetails(isoDate, options = {}) {
  if (!refs.sideCalendarDetails || !isoDate) {
    return;
  }

  const dueTasks = getDueTasksByDay(isoDate);
  if (dueTasks.length === 0 && !options.showEmpty) {
    clearSideCalendarDetails();
    return;
  }

  const heading = document.createElement("p");
  heading.className = "side-calendar-details-title";
  heading.textContent = `${fromIsoDay(isoDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    weekday: "short",
  })} · ${dueTasks.length} due`;

  const list = document.createElement("ul");
  list.className = "side-calendar-details-list";
  if (dueTasks.length === 0) {
    const item = document.createElement("li");
    item.className = "side-calendar-details-item";
    item.textContent = "No tasks due.";
    list.appendChild(item);
  } else {
    for (const task of dueTasks.slice(0, 8)) {
      const item = document.createElement("li");
      item.className = "side-calendar-details-item";
      if (task.isCompleted) {
        item.classList.add("is-done");
      }
      item.textContent = task.text;
      list.appendChild(item);
    }
  }

  refs.sideCalendarDetails.replaceChildren(heading, list);
  refs.sideCalendarDetails.hidden = false;
}

function clearSideCalendarDetails() {
  if (!refs.sideCalendarDetails) {
    return;
  }
  refs.sideCalendarDetails.hidden = true;
  refs.sideCalendarDetails.replaceChildren();
}

function syncTasksContentLayout() {
  if (!refs.tasksContent) {
    return;
  }

  const sideHasVisibleContent = Boolean(refs.statusPanel && !refs.statusPanel.hidden)
    || Boolean(refs.sideCalendarCard && !refs.sideCalendarCard.hidden);

  refs.tasksContent.classList.toggle("has-side-content", sideHasVisibleContent);
  refs.tasksContent.classList.toggle("no-side-content", !sideHasVisibleContent);
}

async function retryTaskSync() {
  if (state.requestInFlight || state.authRequestInFlight || state.profileRequestInFlight) {
    return;
  }

  if (state.useLocalStorageMode) {
    setStatus("Local mode is active. Tasks stay on this device.", "warn");
    return;
  }

  if (!state.sessionUser) {
    promptSignInFromStatus();
    return;
  }

  setStatus("Retrying sync…", "info");
  await refreshTasks();
}

function promptSignInFromStatus() {
  if (state.useLocalStorageMode) {
    return;
  }

  state.showVerifySentPage = false;
  state.authMode = "login";
  saveAuthMode();
  syncAuthModeUI();
  requireSignIn("Sign in to resume server sync.", "warn");
  refs.authEmail?.focus();
}

function setStatus(message, type = "info", actions = {}) {
  if (!refs.statusLine) {
    return;
  }

  const showMessage = Boolean(message);
  const normalizedType = normalizeToastType(type);
  const showRetry = showMessage && Boolean(actions.retry);
  const showSignIn = showMessage && Boolean(actions.signIn);

  if (refs.statusPanel) {
    refs.statusPanel.hidden = true;
  }

  refs.statusLine.hidden = true;
  refs.statusLine.textContent = message || "";
  refs.statusLine.dataset.type = normalizedType;

  if (showMessage) {
    showToast("status", message, normalizedType, {
      retry: showRetry,
      signIn: showSignIn,
    });
  } else {
    clearToast("status");
  }

  syncTasksContentLayout();
}

function clearStatus() {
  setStatus("", "info");
}

function showToast(source, message, type = "info", actions = {}) {
  if (!refs.toastRegion) {
    return;
  }

  const normalizedType = normalizeToastType(type);
  const retryAction = Boolean(actions.retry);
  const signInAction = Boolean(actions.signIn);
  const persistent = Boolean(actions.persist);
  const shouldAutoDismiss = !retryAction && !signInAction && !persistent;

  if (state.toastDismissTimeoutId) {
    clearTimeout(state.toastDismissTimeoutId);
    state.toastDismissTimeoutId = null;
  }

  state.activeToastSource = source;

  const toast = document.createElement("article");
  toast.className = "toast";
  toast.dataset.type = normalizedType;
  toast.setAttribute("role", normalizedType === "error" ? "alert" : "status");
  toast.setAttribute("aria-live", normalizedType === "error" ? "assertive" : "polite");

  const copy = document.createElement("p");
  copy.className = "toast-copy";
  copy.textContent = message;

  const controls = document.createElement("div");
  controls.className = "toast-controls";

  if (retryAction) {
    controls.append(createToastAction("Retry sync", true, () => {
      clearToast(source);
      retryTaskSync();
    }));
  }

  if (signInAction) {
    controls.append(createToastAction("Sign in", !retryAction, () => {
      clearToast(source);
      promptSignInFromStatus();
    }));
  }

  controls.append(createToastAction("×", false, () => {
    clearToast(source);
  }, { close: true }));

  toast.append(copy, controls);
  refs.toastRegion.replaceChildren(toast);
  refs.toastRegion.hidden = false;

  requestAnimationFrame(() => {
    toast.classList.add("is-visible");
  });

  if (shouldAutoDismiss) {
    state.toastDismissTimeoutId = window.setTimeout(() => {
      clearToast(source);
    }, resolveToastTimeout(normalizedType));
  }
}

function clearToast(source = null) {
  if (!refs.toastRegion) {
    return;
  }

  if (source && state.activeToastSource !== source) {
    return;
  }

  if (state.toastDismissTimeoutId) {
    clearTimeout(state.toastDismissTimeoutId);
    state.toastDismissTimeoutId = null;
  }

  refs.toastRegion.replaceChildren();
  refs.toastRegion.hidden = true;
  state.activeToastSource = null;
}

function createToastAction(label, primary, onClick, options = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "toast-action";
  if (primary) {
    button.classList.add("is-primary");
  }
  if (options.close) {
    button.classList.add("toast-close");
    button.setAttribute("aria-label", "Dismiss notification");
  }
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function resolveToastTimeout(type) {
  if (type === "error") {
    return 5200;
  }
  if (type === "warn") {
    return 4300;
  }
  return 3200;
}

function normalizeToastType(type) {
  if (type === "error") {
    return "error";
  }
  if (type === "warn") {
    return "warn";
  }
  return "info";
}

function normalizedDraftDate(value) {
  if (value) {
    return value;
  }
  return isoDay(startOfLocalDay(new Date()));
}

function formatDateSelection(iso) {
  const date = fromIsoDay(iso);
  return date.toLocaleDateString(undefined, {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

function formatAccountCreatedAt(isoTimestamp) {
  if (!isoTimestamp) {
    return "Unknown";
  }

  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function openCalendar(target) {
  state.calendarTarget = target;

  const input = target === "edit" ? refs.editDueDateInput : refs.dueDateInput;
  state.calendarReturnFocusEl = target === "edit" ? refs.editDueDateSelect : refs.dueDateSelect;
  const currentIso = input.value || isoDay(startOfLocalDay(new Date()));
  state.calendarMonth = startOfMonth(fromIsoDay(currentIso));
  state.calendarFocusedIso = currentIso;

  refs.calendarDialog.hidden = false;
  renderCalendar();
  focusCalendarActiveDay();
}

function closeCalendar() {
  const returnFocusTarget = state.calendarReturnFocusEl;
  refs.calendarDialog.hidden = true;
  state.calendarTarget = null;
  state.calendarFocusedIso = null;
  state.calendarReturnFocusEl = null;

  if (returnFocusTarget && typeof returnFocusTarget.focus === "function") {
    returnFocusTarget.focus();
  }
}

function applyCalendarSelection(iso) {
  if (!state.calendarTarget || !iso) {
    return;
  }

  state.calendarFocusedIso = iso;

  if (state.calendarTarget === "edit") {
    state.editHasDueDate = true;
    refs.editDueDateInput.value = iso;
    syncEditDueToggleUI();
  } else {
    state.draftHasDueDate = true;
    refs.dueDateInput.value = iso;
    syncDueToggleUI();
  }

  closeCalendar();
}

function shiftCalendarMonth(amount) {
  const focused = state.calendarFocusedIso ? fromIsoDay(state.calendarFocusedIso) : startOfLocalDay(new Date());
  const nextFocused = clampCalendarDate(addMonthsClamped(focused, amount));

  state.calendarMonth = startOfMonth(nextFocused);
  state.calendarFocusedIso = isoDay(nextFocused);
  renderCalendar();
  focusCalendarActiveDay();
}

function handleCalendarKeydown(event) {
  if (refs.calendarDialog.hidden) {
    return;
  }

  const currentFocused = state.calendarFocusedIso
    ? fromIsoDay(state.calendarFocusedIso)
    : startOfLocalDay(new Date());

  let nextDate = null;

  switch (event.key) {
    case "ArrowLeft":
      nextDate = addDays(currentFocused, -1);
      break;
    case "ArrowRight":
      nextDate = addDays(currentFocused, 1);
      break;
    case "ArrowUp":
      nextDate = addDays(currentFocused, -7);
      break;
    case "ArrowDown":
      nextDate = addDays(currentFocused, 7);
      break;
    case "Home":
      nextDate = addDays(currentFocused, -currentFocused.getDay());
      break;
    case "End":
      nextDate = addDays(currentFocused, 6 - currentFocused.getDay());
      break;
    case "PageUp":
      nextDate = addMonthsClamped(currentFocused, event.shiftKey ? -12 : -1);
      break;
    case "PageDown":
      nextDate = addMonthsClamped(currentFocused, event.shiftKey ? 12 : 1);
      break;
    case "Enter":
    case " ":
      event.preventDefault();
      applyCalendarSelection(isoDay(currentFocused));
      return;
    default:
      return;
  }

  event.preventDefault();
  moveCalendarFocus(nextDate);
}

function moveCalendarFocus(nextDate) {
  const clamped = clampCalendarDate(nextDate);
  state.calendarMonth = startOfMonth(clamped);
  state.calendarFocusedIso = isoDay(clamped);
  renderCalendar();
  focusCalendarActiveDay();
}

function clearCalendarSelection() {
  if (!state.calendarTarget) {
    return;
  }

  if (state.calendarTarget === "edit") {
    state.editHasDueDate = false;
    refs.editDueDateInput.value = "";
    syncEditDueToggleUI();
  } else {
    state.draftHasDueDate = false;
    refs.dueDateInput.value = "";
    syncDueToggleUI();
  }

  closeCalendar();
}

function renderCalendar() {
  const monthStart = startOfMonth(state.calendarMonth);
  const monthEnd = endOfMonth(monthStart);
  const viewMonth = monthStart.getMonth();

  refs.calendarMonthLabel.textContent = monthStart.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const selectedIso = state.calendarTarget === "edit"
    ? (state.editHasDueDate ? refs.editDueDateInput.value : "")
    : (state.draftHasDueDate ? refs.dueDateInput.value : "");

  const todayIso = isoDay(startOfLocalDay(new Date()));
  if (!state.calendarFocusedIso) {
    state.calendarFocusedIso = selectedIso || todayIso;
  }

  const gridStart = addDays(monthStart, -monthStart.getDay());
  const totalCells = 42;
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < totalCells; index += 1) {
    const day = addDays(gridStart, index);
    const dayIso = isoDay(day);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.dataset.iso = dayIso;
    button.id = `calendar-day-${dayIso}`;
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-label", day.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }));
    button.tabIndex = dayIso === state.calendarFocusedIso ? 0 : -1;
    button.textContent = String(day.getDate());

    if (day.getMonth() !== viewMonth) {
      button.classList.add("is-outside");
    }
    if (dayIso === todayIso) {
      button.classList.add("is-today");
      button.setAttribute("aria-current", "date");
    }
    if (selectedIso && dayIso === selectedIso) {
      button.classList.add("is-selected");
      button.setAttribute("aria-selected", "true");
    } else {
      button.setAttribute("aria-selected", "false");
    }

    fragment.appendChild(button);
  }

  refs.calendarGrid.replaceChildren(fragment);
  refs.calendarGrid.setAttribute(
    "aria-activedescendant",
    state.calendarFocusedIso ? `calendar-day-${state.calendarFocusedIso}` : ""
  );
  refs.calendarPrev.disabled = monthStart.getTime() <= addMonths(startOfLocalDay(new Date()), CALENDAR_MIN_MONTH).getTime();
  refs.calendarNext.disabled = monthEnd.getTime() >= addMonths(startOfLocalDay(new Date()), CALENDAR_MAX_MONTH).getTime();
}

function focusCalendarActiveDay() {
  if (!state.calendarFocusedIso) {
    return;
  }

  const activeDay = document.getElementById(`calendar-day-${state.calendarFocusedIso}`);
  if (!activeDay) {
    return;
  }

  activeDay.focus({ preventScroll: true });
}

function addMonthsClamped(date, amount) {
  const monthStart = new Date(date.getFullYear(), date.getMonth() + amount, 1);
  const maxDay = endOfMonth(monthStart).getDate();
  return new Date(monthStart.getFullYear(), monthStart.getMonth(), Math.min(date.getDate(), maxDay));
}

function clampCalendarDate(date) {
  const minDate = addMonths(startOfLocalDay(new Date()), CALENDAR_MIN_MONTH);
  const maxDate = endOfMonth(addMonths(startOfLocalDay(new Date()), CALENDAR_MAX_MONTH));

  if (date.getTime() < minDate.getTime()) {
    return minDate;
  }
  if (date.getTime() > maxDate.getTime()) {
    return maxDate;
  }
  return date;
}

function addDays(date, amount) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayDelta(iso) {
  const now = startOfLocalDay(new Date());
  const due = startOfLocalDay(fromIsoDay(iso));
  const diff = due.getTime() - now.getTime();
  return Math.round(diff / 86400000);
}

function fromIsoDay(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isoDay(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function scopedTasksCacheKey(userId) {
  return userId ? `${TASKS_CACHE_KEY}:${userId}` : TASKS_CACHE_KEY;
}

function legacyScopedTasksCacheKey(userId) {
  return userId ? `${LEGACY_TASKS_CACHE_KEY}:${userId}` : LEGACY_TASKS_CACHE_KEY;
}

function loadTasksCache(userId = null) {
  const candidateKeys = userId
    ? [
      scopedTasksCacheKey(userId),
      legacyScopedTasksCacheKey(userId),
    ]
    : [
      TASKS_CACHE_KEY,
      LEGACY_TASKS_CACHE_KEY,
      "duee:web:tasks:v1",
    ];

  for (const key of candidateKeys) {
    const raw = localStorage.getItem(key);
    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        continue;
      }
      return parsed.map(normalizeTask).filter(Boolean);
    } catch {
      continue;
    }
  }

  return [];
}

function saveTasksCache() {
  const key = scopedTasksCacheKey(state.useLocalStorageMode ? null : state.sessionUser?.id ?? null);
  localStorage.setItem(key, JSON.stringify(state.tasks));
}

function loadLocalModeTasks() {
  const raw = localStorage.getItem(LOCAL_TASKS_KEY);
  if (!raw) {
    return loadTasksCache();
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return loadTasksCache();
    }
    return parsed.map(normalizeTask).filter(Boolean);
  } catch {
    return loadTasksCache();
  }
}

function saveLocalModeTasks() {
  localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(state.tasks));
  saveTasksCache();
}

function normalizeTask(rawTask) {
  if (!rawTask || typeof rawTask !== "object") {
    return null;
  }

  const text = typeof rawTask.text === "string" ? rawTask.text.trim() : "";
  if (!text) {
    return null;
  }

  const hasDueDate = rawTask.hasDueDate !== undefined
    ? Boolean(rawTask.hasDueDate)
    : Boolean(rawTask.dueDate);

  const dueDate = hasDueDate && typeof rawTask.dueDate === "string" && rawTask.dueDate
    ? rawTask.dueDate
    : null;

  return {
    id: typeof rawTask.id === "string" && rawTask.id ? rawTask.id : `tmp-${Date.now()}`,
    text,
    hasDueDate: dueDate !== null,
    dueDate,
    isCompleted: Boolean(rawTask.isCompleted),
    createdAt: typeof rawTask.createdAt === "string" ? rawTask.createdAt : new Date().toISOString(),
    completedAt: typeof rawTask.completedAt === "string" ? rawTask.completedAt : null,
  };
}

function normalizeUser(rawUser) {
  if (!rawUser || typeof rawUser !== "object") {
    return null;
  }

  const id = typeof rawUser.id === "string" ? rawUser.id : "";
  const email = typeof rawUser.email === "string" ? rawUser.email : "";
  const fallbackDisplayName = email.includes("@") ? email.slice(0, email.indexOf("@")) : email;
  const displayNameRaw = typeof rawUser.displayName === "string" ? rawUser.displayName : fallbackDisplayName;
  const displayName = displayNameRaw.trim();
  const createdAt = typeof rawUser.createdAt === "string" ? rawUser.createdAt : null;
  const emailVerifiedAt = typeof rawUser.emailVerifiedAt === "string" ? rawUser.emailVerifiedAt : null;
  const emailVerified = rawUser.emailVerified === undefined
    ? Boolean(emailVerifiedAt)
    : Boolean(rawUser.emailVerified);

  if (!id || !email || !displayName) {
    return null;
  }

  return {
    id,
    email,
    displayName,
    createdAt,
    emailVerified,
    emailVerifiedAt,
  };
}

function defaultPrefs() {
  return {
    minimalMode: false,
    receiveUpdates: true,
    confirmDeletes: true,
    horizontalTaskSections: false,
    sideCalendarVisible: true,
  };
}

function normalizePrefs(rawPrefs) {
  const defaults = defaultPrefs();
  if (!rawPrefs || typeof rawPrefs !== "object") {
    return { ...defaults };
  }

  return {
    minimalMode: rawPrefs.minimalMode === undefined
      ? (rawPrefs.hideDone === undefined ? defaults.minimalMode : Boolean(rawPrefs.hideDone))
      : Boolean(rawPrefs.minimalMode),
    receiveUpdates: rawPrefs.receiveUpdates === undefined
      ? defaults.receiveUpdates
      : Boolean(rawPrefs.receiveUpdates),
    confirmDeletes: rawPrefs.confirmDeletes === undefined
      ? defaults.confirmDeletes
      : Boolean(rawPrefs.confirmDeletes),
    horizontalTaskSections: rawPrefs.horizontalTaskSections === undefined
      ? defaults.horizontalTaskSections
      : Boolean(rawPrefs.horizontalTaskSections),
    sideCalendarVisible: rawPrefs.sideCalendarVisible === undefined
      ? defaults.sideCalendarVisible
      : Boolean(rawPrefs.sideCalendarVisible),
  };
}

function loadPrefs() {
  const raw = localStorage.getItem(PREFS_KEY);
  if (!raw) {
    return defaultPrefs();
  }

  try {
    return normalizePrefs(JSON.parse(raw));
  } catch {
    return defaultPrefs();
  }
}

function savePrefs() {
  localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs));
}

function persistPrefs({ renderTasks = false } = {}) {
  savePrefs();
  syncProfilePreferencesUI();
  syncSideCalendarUI();
  if (renderTasks) {
    render();
  }
  if (!state.useLocalStorageMode && state.sessionUser && !requiresEmailVerificationGate()) {
    syncPrefsToServer();
  }
}

async function refreshPrefsFromServer() {
  if (state.useLocalStorageMode || !state.sessionUser || requiresEmailVerificationGate()) {
    return;
  }

  try {
    const remotePrefs = await apiGetPrefs();
    state.prefs = normalizePrefs(remotePrefs);
    savePrefs();
    syncProfilePreferencesUI();
    syncSideCalendarUI();
    render();
  } catch (error) {
    if (handleUnauthorizedError(error)) {
      return;
    }
    console.error("Failed to load preferences:", error);
  }
}

async function syncPrefsToServer() {
  if (state.useLocalStorageMode || !state.sessionUser || requiresEmailVerificationGate()) {
    return;
  }
  if (state.prefsSyncInFlight) {
    state.prefsSyncPending = true;
    return;
  }

  state.prefsSyncInFlight = true;
  try {
    const savedPrefs = await apiUpdatePrefs(state.prefs);
    state.prefs = normalizePrefs(savedPrefs);
    savePrefs();
  } catch (error) {
    if (handleUnauthorizedError(error)) {
      return;
    }
    console.error("Failed to sync preferences:", error);
  } finally {
    state.prefsSyncInFlight = false;
    syncProfilePreferencesUI();
    syncSideCalendarUI();
    render();
    if (state.prefsSyncPending) {
      state.prefsSyncPending = false;
      syncPrefsToServer().catch((error) => {
        console.error("Failed to sync queued preferences:", error);
      });
    }
  }
}

function loadAuthMode() {
  const raw = localStorage.getItem(AUTH_MODE_KEY);
  return raw === "register" ? "register" : "login";
}

function saveAuthMode() {
  localStorage.setItem(AUTH_MODE_KEY, state.authMode === "register" ? "register" : "login");
}

async function resolveStorageMode() {
  const urlMode = new URLSearchParams(window.location.search).get("debug_storage");
  if (urlMode && urlMode.toLowerCase() === "local") {
    return true;
  }

  try {
    const payload = await apiRequest("/config");
    return Boolean(payload.debugLocalStorage);
  } catch {
    return false;
  }
}

async function apiGetSession() {
  const payload = await apiRequest("/auth/session");
  return {
    authenticated: Boolean(payload.authenticated),
    user: normalizeUser(payload.user),
  };
}

async function apiLogin(email, password) {
  const payload = await apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  return {
    user: normalizeUser(payload.user),
  };
}

async function apiRegister(email, password, displayName) {
  const payload = await apiRequest("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName }),
  });

  return {
    ok: Boolean(payload.ok),
    pendingVerification: Boolean(payload.pendingVerification),
    email: typeof payload.email === "string" ? payload.email : email,
    verificationEmailSent: payload.verificationEmailSent !== undefined
      ? Boolean(payload.verificationEmailSent)
      : true,
    user: normalizeUser(payload.user),
  };
}

async function apiLogout() {
  await apiRequest("/auth/logout", {
    method: "POST",
  });
}

async function apiDeleteAccount(password) {
  await apiRequest("/auth/account", {
    method: "DELETE",
    body: JSON.stringify({ password }),
  });
}

async function apiUpdateProfile(displayName) {
  const payload = await apiRequest("/auth/profile", {
    method: "PATCH",
    body: JSON.stringify({ displayName }),
  });

  return {
    user: normalizeUser(payload.user),
  };
}

async function apiRequestPasswordReset(email) {
  await apiRequest("/auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

async function apiConfirmPasswordReset(token, password) {
  await apiRequest("/auth/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}

async function apiVerifyEmailToken(token) {
  const payload = await apiRequest("/auth/email-verification/verify", {
    method: "POST",
    body: JSON.stringify({ token }),
  });

  return {
    alreadyVerified: Boolean(payload.alreadyVerified),
    user: normalizeUser(payload.user),
  };
}

async function apiResendEmailVerification() {
  const payload = await apiRequest("/auth/email-verification/request", {
    method: "POST",
  });
  return {
    alreadyVerified: Boolean(payload.alreadyVerified),
  };
}

async function apiResendEmailVerificationByEmail(email) {
  await apiRequest("/auth/email-verification/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

async function apiGetPrefs() {
  const payload = await apiRequest("/prefs");
  return normalizePrefs(payload.prefs);
}

async function apiUpdatePrefs(prefs) {
  const payload = await apiRequest("/prefs", {
    method: "PATCH",
    body: JSON.stringify({
      hideDone: Boolean(prefs.minimalMode),
      receiveUpdates: Boolean(prefs.receiveUpdates),
      confirmDeletes: Boolean(prefs.confirmDeletes),
      horizontalTaskSections: Boolean(prefs.horizontalTaskSections),
      sideCalendarVisible: Boolean(prefs.sideCalendarVisible),
    }),
  });
  return normalizePrefs(payload.prefs);
}

async function apiGetTasks() {
  const payload = await apiRequest("/tasks");
  if (!Array.isArray(payload.tasks)) {
    throw new Error("Invalid tasks response from server.");
  }
  return payload.tasks.map(normalizeTask).filter(Boolean);
}

async function apiCreateTask(taskPayload) {
  const payload = await apiRequest("/tasks", {
    method: "POST",
    body: JSON.stringify(taskPayload),
  });

  const normalized = normalizeTask(payload.task);
  if (!normalized) {
    throw new Error("Server returned invalid task payload.");
  }
  return normalized;
}

async function apiUpdateTask(taskId, taskPayload) {
  const payload = await apiRequest(`/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    body: JSON.stringify(taskPayload),
  });

  const normalized = normalizeTask(payload.task);
  if (!normalized) {
    throw new Error("Server returned invalid task payload.");
  }
  return normalized;
}

async function apiDeleteTask(taskId) {
  await apiRequest(`/tasks/${encodeURIComponent(taskId)}`, {
    method: "DELETE",
  });
}

async function apiRequest(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  let csrfToken = "";
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    csrfToken = readCookie("duee_csrf");
    if (!csrfToken) {
      try {
        await fetch(`${API_BASE}/config`, {
          method: "GET",
          credentials: "same-origin",
        });
      } catch {
        // Ignore preflight failure and continue with main request.
      }
      csrfToken = readCookie("duee_csrf");
    }
  }

  const headers = {
    ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
    ...(options.headers || {}),
  };
  if (csrfToken) {
    headers["x-csrf-token"] = csrfToken;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "same-origin",
    ...options,
    method,
    headers,
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : {};

  if (!response.ok) {
    const message = payload?.error || `Request failed with status ${response.status}.`;
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  return payload;
}

function downloadJsonFile(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json; charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

function sanitizeAuthActionToken(value) {
  if (typeof value !== "string") {
    return "";
  }

  const token = value.trim();
  if (!token || !AUTH_ACTION_TOKEN_REGEX.test(token)) {
    return "";
  }

  return token;
}

function readCookie(name) {
  if (!document.cookie) {
    return "";
  }

  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escapedName}=([^;]*)`));
  if (!match) {
    return "";
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function isUnauthorizedError(error) {
  return Number(error?.statusCode) === 401;
}

function handleUnauthorizedError(error) {
  if (!isUnauthorizedError(error)) {
    return false;
  }

  setStatus("Session expired. Sign in again to keep tasks in sync.", "warn", { signIn: true });
  requireSignIn("Session expired. Please sign in again.", "warn");
  return true;
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function migrateCachedTasks(cachedTasks) {
  const migrated = [];

  for (const task of cachedTasks) {
    const created = await apiCreateTask({
      text: task.text,
      hasDueDate: Boolean(task.hasDueDate),
      dueDate: task.hasDueDate ? normalizedDraftDate(task.dueDate) : null,
    });

    if (task.isCompleted) {
      const completed = await apiUpdateTask(created.id, { isCompleted: true });
      migrated.push(completed);
    } else {
      migrated.push(created);
    }
  }

  return migrated;
}
