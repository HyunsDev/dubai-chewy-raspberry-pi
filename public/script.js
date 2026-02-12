async function updateStatus() {
  try {
    const response = await fetch("/api/html");
    if (!response.ok) throw new Error("Network response was not ok");
    const html = await response.text();
    document.getElementById("status").innerHTML = html;
  } catch (error) {
    console.error("Failed to fetch status:", error);
    document.getElementById("status").innerText = "Error fetching status...";
  }
}

// Initial load
updateStatus();

// Refresh every 10 seconds
setInterval(updateStatus, 10000);
