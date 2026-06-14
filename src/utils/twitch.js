import axios from 'axios';

const { TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET } = process.env;

// Refresh Twitch user token
export async function refreshTwitchUserToken(refreshToken) {

  try {
    const params = new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });

    const { data } = await axios.post('https://id.twitch.tv/oauth2/token', params);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000)
    };
  } catch (error) {
    console.error('[refreshTwitchUserToken]:', error.response?.data || error.message);
    throw new Error('Token refresh failed');
  }
}

// Get Twitch user info
export async function getTwitchUser(accessToken) {

  try {
    const { data } = await axios.get('https://api.twitch.tv/helix/users', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Client-Id': TWITCH_CLIENT_ID
      }
    });

    return data.data[0];
  } catch (error) {
    console.error('[getTwitchUser]:', error.response?.data || error.message);
    throw new Error('Failed to get Twitch user');
  }
}

// Exchange OAuth code for tokens
export async function exchangeTwitchCode(code, redirectUri) {

  try {
    const params = new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    });

    const { data } = await axios.post('https://id.twitch.tv/oauth2/token', params);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in
    };
  } catch (error) {
    console.error('[exchangeTwitchCode]:', error.response?.data || error.message);
    throw new Error('Code exchange failed');
  }
}

// Revoke Twitch token
export async function revokeTwitchToken(token) {
  const { TWITCH_CLIENT_ID } = process.env;

  try {
    await axios.post('https://id.twitch.tv/oauth2/revoke',
      new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        token
      })
    );
  } catch (error) {
    console.error('[revokeTwitchToken]:', error.response?.data || error.message);
  }
}

// Get Twitch auth URL for frontend
export function getAuthUrl(redirectUri, state) {
  const scopes = ['user:read:email'].join(' ');

  const params = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    state
  });

  return `https://id.twitch.tv/oauth2/authorize?${params}`;
}