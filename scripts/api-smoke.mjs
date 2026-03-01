const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:4000";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeDueDate(daysFromNow = 14) {
  const now = new Date();
  now.setDate(now.getDate() + daysFromNow);
  return now.toISOString().slice(0, 10);
}

async function request(path, options = {}) {
  const method = options.method ?? "GET";
  const headers = {
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...(options.json ? { "Content-Type": "application/json" } : {}),
  };

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: options.form
      ? options.form
      : options.json
        ? JSON.stringify(options.json)
        : undefined,
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new Error(
      `[${method}] ${path} -> ${response.status}: ${
        typeof payload === "string" ? payload : JSON.stringify(payload)
      }`,
    );
  }
  return payload;
}

async function expectRequestFailure(path, expectedStatus, options = {}) {
  try {
    await request(path, options);
  } catch (error) {
    const message = String(error?.message ?? error);
    if (message.includes(`-> ${expectedStatus}:`)) {
      return;
    }
    throw new Error(
      `Expected status ${expectedStatus} for ${path}, but got: ${message}`,
    );
  }
  throw new Error(`Expected ${path} to fail with ${expectedStatus}, but it succeeded.`);
}

async function main() {
  const now = Date.now();
  const title = `API Smoke ${now}`;
  const planText = `Automated smoke scenario ${now}`;
  const dueDate = makeDueDate();

  console.log(`[smoke] API base: ${API_BASE_URL}`);

  const health = await request("/health");
  assert(health?.ok === true, "Health check failed");
  console.log("[smoke] health ok");

  const employeeLogin = await request("/api/auth/login", {
    method: "POST",
    json: { employeeId: "emp001", password: "Emp1234!" },
  });
  const employeeToken = employeeLogin?.token;
  assert(employeeToken, "Employee login token missing");
  console.log("[smoke] employee login ok");

  const created = await request("/api/work-items", {
    method: "POST",
    token: employeeToken,
    json: { title, planText, dueDate },
  });
  const workItemId = created?.item?.id;
  assert(workItemId, "Work item creation failed");
  console.log(`[smoke] work item created: ${workItemId}`);

  const myList = await request(
    `/api/work-items/me?q=${encodeURIComponent(title)}`,
    { token: employeeToken },
  );
  assert(
    Array.isArray(myList?.items) && myList.items.some((item) => item.id === workItemId),
    "Created work item not found in my list",
  );
  console.log("[smoke] work item list lookup ok");

  const createdChangeRequest = await request(`/api/work-items/${workItemId}/change-requests`, {
    method: "POST",
    token: employeeToken,
    json: {
      changeText: `scope update ${now}`,
      proposedPlanText: `updated plan ${now}`,
    },
  });
  const changeRequestId = createdChangeRequest?.changeRequest?.id;
  assert(changeRequestId, "Change request creation failed");
  console.log(`[smoke] change request created: ${changeRequestId}`);

  const adminLogin = await request("/api/auth/login", {
    method: "POST",
    json: { employeeId: "admin001", password: "Admin1234!" },
  });
  const adminToken = adminLogin?.token;
  assert(adminToken, "Admin login token missing");
  console.log("[smoke] admin login ok");

  const requestedList = await request(
    `/api/admin/change-requests?status=REQUESTED&requesterEmployeeId=emp001&q=${encodeURIComponent(
      title,
    )}`,
    { token: adminToken },
  );
  assert(
    Array.isArray(requestedList?.items) &&
      requestedList.items.some((item) => item.id === changeRequestId),
    "Change request list filter did not return REQUESTED item",
  );
  console.log("[smoke] change request list filter (REQUESTED) ok");

  await expectRequestFailure(
    `/api/admin/change-requests/${changeRequestId}/review`,
    400,
    {
      method: "POST",
      token: adminToken,
      json: { status: "REJECTED" },
    },
  );
  console.log("[smoke] change request reject requires comment ok");

  await request(`/api/admin/change-requests/${changeRequestId}/review`, {
    method: "POST",
    token: adminToken,
    json: { status: "APPROVED", comment: "smoke approve change request" },
  });
  console.log("[smoke] admin review change request APPROVED ok");

  const approvedList = await request(
    `/api/admin/change-requests?status=APPROVED&requesterEmployeeId=emp001&q=${encodeURIComponent(
      title,
    )}`,
    { token: adminToken },
  );
  assert(
    Array.isArray(approvedList?.items) &&
      approvedList.items.some((item) => item.id === changeRequestId),
    "Change request list filter did not return APPROVED item",
  );
  console.log("[smoke] change request list filter (APPROVED) ok");

  const detailAfterChange = await request(`/api/work-items/${workItemId}`, {
    token: employeeToken,
  });
  assert(
    Array.isArray(detailAfterChange?.changeRequests) &&
      detailAfterChange.changeRequests.some(
        (changeRequest) =>
          changeRequest.id === changeRequestId && changeRequest.status === "APPROVED",
      ),
    "Approved change request not found in work item detail",
  );
  console.log("[smoke] change request status reflected in detail ok");

  const createdSubmission = await request(`/api/work-items/${workItemId}/submissions`, {
    method: "POST",
    token: employeeToken,
    json: { changeRequestId },
  });
  const submissionId = createdSubmission?.submission?.id;
  assert(submissionId, "Submission creation failed");
  assert(
    createdSubmission?.submission?.changeRequestId === changeRequestId,
    "Submission did not link approved change request",
  );
  console.log(`[smoke] submission created: ${submissionId}`);

  const form = new FormData();
  form.append(
    "files",
    new Blob([`api smoke upload ${now}`], { type: "text/plain" }),
    `api-smoke-${now}.txt`,
  );
  const uploaded = await request(`/api/submissions/${submissionId}/files`, {
    method: "POST",
    token: employeeToken,
    form,
  });
  assert(Array.isArray(uploaded?.uploaded) && uploaded.uploaded.length > 0, "Upload failed");
  console.log("[smoke] file upload ok");

  const finalized = await request(`/api/submissions/${submissionId}/finalize`, {
    method: "POST",
    token: employeeToken,
    json: { noteText: `finalize ${now}` },
  });
  assert(finalized?.submission?.status === "SUBMITTED", "Finalize status is not SUBMITTED");
  console.log("[smoke] finalize ok");

  const employeeStatus = await request(`/api/submissions/${submissionId}/status`, {
    token: employeeToken,
  });
  assert(
    employeeStatus?.submission?.status === "SUBMITTED",
    "Submission status endpoint mismatch before admin review",
  );
  console.log("[smoke] submission status (employee) ok");

  await request(`/api/admin/work-items?q=${encodeURIComponent(title)}`, {
    token: adminToken,
  });
  console.log("[smoke] admin work item lookup ok");

  await expectRequestFailure(`/api/admin/submissions/${submissionId}/review`, 400, {
    method: "POST",
    token: adminToken,
    json: { status: "REJECTED" },
  });
  console.log("[smoke] submission reject requires comment ok");

  await request(`/api/admin/submissions/${submissionId}/review`, {
    method: "POST",
    token: adminToken,
    json: { status: "DONE", comment: "smoke approve" },
  });
  console.log("[smoke] admin review DONE ok");

  const adminStatus = await request(`/api/submissions/${submissionId}/status`, {
    token: adminToken,
  });
  assert(
    adminStatus?.submission?.status === "DONE",
    "Submission status endpoint mismatch after admin review",
  );
  console.log("[smoke] submission status (admin) ok");

  console.log("[smoke] API scenario passed");
}

main().catch((error) => {
  console.error("[smoke] failed");
  console.error(error);
  process.exit(1);
});
