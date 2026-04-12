const API_BASE = "/api";
const TASKS_CACHE_KEY = "duee:web:tasks-cache:v3";
const LEGACY_TASKS_CACHE_KEY = "duee:web:tasks-cache:v2";
const LOCAL_TASKS_KEY = "duee:web:tasks:v1";
const PREFS_KEY = "duee:web:prefs:v1";
const AUTH_MODE_KEY = "duee:web:auth-mode:v1";
const CALENDAR_MIN_MONTH = -120;
const CALENDAR_MAX_MONTH = 120;

const state = {
  tasks: [],
  prefs: loadPrefs(),
  authMode: loadAuthMode(),
  sessionUser: null,
  currentView: "tasks",
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
  authSwitchPrefix: document.getElementById("authSwitchPrefix"),
  authSwitchButton: document.getElementById("authSwitchButton"),
  authStatus: document.getElementById("authStatus"),
  profilePage: document.getElementById("profilePage"),
  profileForm: document.getElementById("profileForm"),
  profileDisplayNameValue: document.getElementById("profileDisplayNameValue"),
  profileDisplayNameInput: document.getElementById("profileDisplayNameInput"),
  profileDisplayNameEditor: document.getElementById("profileDisplayNameEditor"),
  profileEditButton: document.getElementById("profileEditButton"),
  profileCancelEditButton: document.getElementById("profileCancelEditButton"),
  profileEmail: document.getElementById("profileEmail"),
  profileCreatedAt: document.getElementById("profileCreatedAt"),
  profileUserId: document.getElementById("profileUserId"),
  profileStatus: document.getElementById("profileStatus"),
  profileHideDoneToggle: document.getElementById("profileHideDoneToggle"),
  profileReceiveUpdatesToggle: document.getElementById("profileReceiveUpdatesToggle"),
  profileConfirmDeleteToggle: document.getElementById("profileConfirmDeleteToggle"),
  profileHorizontalSectionsToggle: document.getElementById("profileHorizontalSectionsToggle"),
  profileSideCalendarToggle: document.getElementById("profileSideCalendarToggle"),
  profileBackButton: document.getElementById("profileBackButton"),
  profileSaveButton: document.getElementById("profileSaveButton"),
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
  taskTemplate: document.getElementById("taskTemplate"),
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
  syncSideCalendarUI();
  syncTasksContentLayout();

  state.useLocalStorageMode = await resolveStorageMode();
  syncAuthUI();

  if (state.useLocalStorageMode) {
    state.tasks = loadLocalModeTasks();
    saveLocalModeTasks();
    setStatus("Debug mode enabled. Tasks are stored only on this device.", "warn");
    render();
    return;
  }

  await bootstrapAuthenticatedSession();
}

async function bootstrapAuthenticatedSession() {
  try {
    const session = await apiGetSession();
    if (!session.authenticated || !session.user) {
      requireSignIn();
      return;
    }

    state.sessionUser = session.user;
    await refreshPrefsFromServer();
    clearAuthStatus();
    syncAuthUI();
    await loadTasksForCurrentUser();
  } catch (error) {
    requireSignIn(error.message || "Could not verify your session.", "error");
  }
}

async function loadTasksForCurrentUser() {
  if (!state.sessionUser) {
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

    if (!payload.user) {
      throw new Error("Authentication response was invalid.");
    }

    state.sessionUser = payload.user;
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
  state.sessionUser = null;
  state.currentView = "tasks";
  state.profileEditing = false;
  state.prefsSyncInFlight = false;
  state.prefsSyncPending = false;
  state.sideCalendarSelectedIso = null;
  state.tasks = [];
  state.pendingTaskMutationIds.clear();
  state.editingTaskId = null;
  setRequestInFlight(false);
  setProfileRequestInFlight(false);
  clearProfileStatus();
  syncAuthUI();
  render();

  if (message) {
    setAuthStatus(message, type);
  } else {
    clearAuthStatus();
  }
}

async function refreshTasks() {
  if (state.useLocalStorageMode || !state.sessionUser) {
    return;
  }

  const cachedSnapshot = [...state.tasks];
  setRequestInFlight(true);
  try {
    const remoteTasks = await apiGetTasks();

    if (remoteTasks.length === 0 && cachedSnapshot.length > 0) {
      const migratedTasks = await migrateCachedTasks(cachedSnapshot);
      state.tasks = migratedTasks;
      saveTasksCache();
      setStatus("Imported your cached tasks to the server.", "info");
      render();
      return;
    }

    state.tasks = remoteTasks;
    saveTasksCache();
    clearStatus();
    render();
  } catch (error) {
    if (handleUnauthorizedError(error)) {
      return;
    }

    if (state.tasks.length > 0) {
      setStatus("Showing cached tasks. Server is unreachable right now.", "warn", { retry: true });
    } else {
      setStatus(error.message || "Could not load tasks from server.", "error", { retry: true });
    }
    render();
  } finally {
    setRequestInFlight(false);
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

    const requiresConfirmation = Boolean(state.prefs.confirmDeletes);
    const confirmed = !requiresConfirmation || window.confirm(`Delete "${task.text}"?`);
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

  const requiresConfirmation = Boolean(state.prefs.confirmDeletes);
  const confirmed = !requiresConfirmation || window.confirm(`Delete "${task.text}"?`);
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

  if (typeof refs.editDialog.showModal === "function") {
    refs.editDialog.showModal();
  } else {
    const nextText = window.prompt("Edit task", task.text);
    if (nextText === null) {
      return;
    }
    const trimmed = nextText.trim();
    if (trimmed) {
      refs.editTaskInput.value = trimmed;
      saveEdit();
    }
  }
}

function closeEditDialog() {
  if (refs.editDialog.open) {
    refs.editDialog.close();
  }
  state.editingTaskId = null;
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
    .sort(compareByDueDate);

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
  if (!signedIn) {
    state.currentView = "tasks";
  }

  const showTasks = state.useLocalStorageMode || signedIn;
  const showProfile = !state.useLocalStorageMode && signedIn && state.currentView === "profile";

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
    refs.accountBar.hidden = state.useLocalStorageMode || !signedIn;
  }

  if (refs.accountDisplayName) {
    refs.accountDisplayName.textContent = state.sessionUser?.displayName || "";
  }

  if (refs.accountIdentity) {
    refs.accountIdentity.title = state.sessionUser?.email || "";
    refs.accountIdentity.setAttribute("aria-label", signedIn ? "Open profile settings" : "Open profile");
  }

  if (refs.authPanel) {
    refs.authPanel.hidden = state.useLocalStorageMode || signedIn;
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
  syncSideCalendarUI();
  syncAccountControlsDisabled();
  syncTasksContentLayout();
}

function openProfilePage() {
  if (state.useLocalStorageMode || !state.sessionUser || state.authRequestInFlight) {
    return;
  }
  state.currentView = "profile";
  state.profileEditing = false;
  clearProfileStatus();
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

  syncPreferenceToggle(refs.profileHideDoneToggle, state.prefs.minimalMode, disabled);
  syncPreferenceToggle(refs.profileReceiveUpdatesToggle, state.prefs.receiveUpdates, disabled);
  syncPreferenceToggle(refs.profileConfirmDeleteToggle, state.prefs.confirmDeletes, disabled);
  syncPreferenceToggle(refs.profileHorizontalSectionsToggle, state.prefs.horizontalTaskSections, disabled);
  syncPreferenceToggle(refs.profileSideCalendarToggle, state.prefs.sideCalendarVisible, disabled);
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
    ? "Create an account to sync your tasks across devices."
    : "Sign in to sync your tasks across devices.";
  refs.authSubmit.textContent = registerMode ? "Create account" : "Sign in";
  refs.authSwitchPrefix.textContent = registerMode ? "Already have an account?" : "Need an account?";
  refs.authSwitchButton.textContent = registerMode ? "Sign in" : "Create account";
  refs.authDisplayNameField.hidden = !registerMode;
  refs.authDisplayName.required = registerMode;
  refs.authDisplayName.disabled = !registerMode;
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
  syncAccountControlsDisabled();
  syncProfileEditUI();
  syncProfilePreferencesUI();
}

function setProfileRequestInFlight(value) {
  state.profileRequestInFlight = value;
  if (refs.profileBackButton) {
    refs.profileBackButton.disabled = value;
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
    refs.accountIdentity.disabled = disabled;
  }
}

function setAuthStatus(message, type = "info") {
  if (!refs.authStatus) {
    return;
  }

  const isError = type === "error";
  refs.authStatus.setAttribute("aria-live", isError ? "assertive" : "polite");
  refs.authStatus.setAttribute("role", isError ? "alert" : "status");
  refs.authStatus.hidden = !message;
  refs.authStatus.textContent = message || "";
  refs.authStatus.dataset.type = type;
}

function clearAuthStatus() {
  setAuthStatus("", "info");
}

function setProfileStatus(message, type = "info") {
  if (!refs.profileStatus) {
    return;
  }

  const isError = type === "error";
  refs.profileStatus.setAttribute("aria-live", isError ? "assertive" : "polite");
  refs.profileStatus.setAttribute("role", isError ? "alert" : "status");
  refs.profileStatus.hidden = !message;
  refs.profileStatus.textContent = message || "";
  refs.profileStatus.dataset.type = type;
}

function clearProfileStatus() {
  setProfileStatus("", "info");
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
  const showRetry = showMessage && Boolean(actions.retry);
  const showSignIn = showMessage && Boolean(actions.signIn);
  const showPanel = showMessage || showRetry || showSignIn;

  if (refs.statusPanel) {
    refs.statusPanel.hidden = !showPanel;
  }

  refs.statusLine.hidden = !showMessage;
  refs.statusLine.textContent = message || "";
  refs.statusLine.dataset.type = type;

  if (!refs.statusActions || !refs.statusRetry || !refs.statusSignIn) {
    return;
  }

  refs.statusRetry.hidden = !showRetry;
  refs.statusSignIn.hidden = !showSignIn;
  refs.statusRetry.classList.toggle("is-primary", showRetry);
  refs.statusSignIn.classList.toggle("is-primary", showSignIn && !showRetry);
  refs.statusActions.hidden = !showRetry && !showSignIn;
  syncTasksContentLayout();
}

function clearStatus() {
  setStatus("", "info");
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

  if (!id || !email || !displayName) {
    return null;
  }

  return { id, email, displayName, createdAt };
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
  if (!state.useLocalStorageMode && state.sessionUser) {
    syncPrefsToServer();
  }
}

async function refreshPrefsFromServer() {
  if (state.useLocalStorageMode || !state.sessionUser) {
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
  if (state.useLocalStorageMode || !state.sessionUser) {
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
    user: normalizeUser(payload.user),
  };
}

async function apiLogout() {
  await apiRequest("/auth/logout", {
    method: "POST",
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
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
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
