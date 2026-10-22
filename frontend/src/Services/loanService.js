
const API = "http://127.0.0.1:8000";

export async function predictLoan(loanData, token) {
  const controller = new AbortController();

  // Stop waiting if the backend does not respond within 15 seconds.
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${API}/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(loanData),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("SESSION_EXPIRED");
      }

      const detail =
        typeof data.detail === "string"
          ? data.detail
          : data.detail
            ? JSON.stringify(data.detail)
            : `Request failed with status ${response.status}`;

      throw new Error(detail);
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        "REQUEST_TIMEOUT: The server took too long to respond. Please try again."
      );
    }

    if (error.message === "SESSION_EXPIRED") {
      throw error;
    }

    if (
      error instanceof TypeError ||
      error.message === "Failed to fetch"
    ) {
      throw new Error(
        "NETWORK_ERROR: Unable to connect to the server. Check that the FastAPI backend is running."
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
