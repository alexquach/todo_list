# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
    npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Google Calendar Integration (Desktop Only)

This app includes Google Calendar integration for desktop web users. To set it up:

1. Create a Google Cloud project at [console.cloud.google.com](https://console.cloud.google.com/)
2. Enable the Google Calendar API
3. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized JavaScript origins: `http://localhost:8081`
   - Authorized redirect URIs: `https://auth.expo.io/@your-expo-username/todolistapp`
4. Copy your Client ID and update it in the `GoogleCalendar.tsx` component:
   ```typescript
   const CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID';
   ```
5. Make sure to use your Expo username in the redirect URI:
   ```typescript
   const REDIRECT_URI = AuthSession.makeRedirectUri({
     scheme: 'todolistapp',
     path: 'redirect'
   });
   ```

When running the app on a desktop browser, you'll see the Google Calendar integration panel on the right side of your todo list.

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
