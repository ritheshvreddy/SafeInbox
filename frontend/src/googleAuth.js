// Google sign-in with Google Identity Services (the script is loaded in index.html).
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";
const SCOPES = [GMAIL_SCOPE, "openid", "email", "profile"].join(" ");

export const CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID || import.meta.env.VITE_REACT_APP_CLIENT_ID || "";

function waitForGoogle(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      if (window.google?.accounts?.oauth2) resolve(window.google.accounts.oauth2);
      else if (Date.now() - started > timeoutMs)
        reject(new Error("Google sign-in didn't load. Check your internet connection and reload the page."));
      else setTimeout(check, 100);
    };
    check();
  });
}

// Opens Google's consent popup and resolves with an access token that includes Gmail access.
export async function requestGmailAccess({ hint } = {}) {
  if (!CLIENT_ID) {
    throw new Error("VITE_GOOGLE_CLIENT_ID is missing in frontend/.env - see the README.");
  }
  const oauth2 = await waitForGoogle();
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      hint,
      callback: (response) => {
        if (response.error) {
          reject(new Error(`Sign-in failed: ${response.error_description || response.error}`));
          return;
        }
        if (!oauth2.hasGrantedAllScopes(response, GMAIL_SCOPE)) {
          oauth2.revoke(response.access_token, () => {});
          reject(
            new Error(
              "Gmail permission wasn't granted. Sign in again and tick the box that lets SafeInbox read and change your Gmail."
            )
          );
          return;
        }
        resolve(response.access_token);
      },
      error_callback: (error) =>
        reject(
          new Error(
            error?.type === "popup_closed"
              ? "The sign-in window was closed before finishing."
              : "Sign-in failed. Allow pop-ups for this site and try again."
          )
        ),
    });
    client.requestAccessToken();
  });
}
