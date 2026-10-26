# Ami Hostlers Jaipur — Setup Guide

Ami Hostlers is built on top of the Chef code, which already works. All the mess features are the same as Chef. Hostel features were added on top of them.

| Folder | Built from | What is new |
|---|---|---|
| `ami_backend` | Chefhospitality_backend-main | Staff accounts, room complaints (48h → warden, 64h → director), SOS, visitor QR register, live alerts, Brevo SMS/email |
| `ami_student` | chefhospitalityservices3.0 | New **Hostel** tab (raise complaint with photo, track it, rate it), **SOS** button on Home, hostel notifications |
| `ami_admin` | chefadminc | One login for everyone. Mess admin gets the same Chef dashboard. Director, warden, attender and repair team get the new hostel screens |

Firebase is **not used**. Notifications come from Socket.io plus local notifications on the phone. SMS and email go through **Brevo**.

---

## 1. Backend (do this first)

```bash
cd ami_backend
npm install
cp .env.example .env      # then open .env and fill your values
npm start
```

Fill these values in `.env`:
- `MONGO_URI`: your Atlas connection string. Use a **new** database name, e.g. `/ami_hostel`.
- `JWT_SECRET`: any long random text.
- `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`: the sender email must be verified in Brevo.
- `BREVO_SMS_SENDER`: a 3–11 letter sender name, e.g. `AMIHST`. SMS needs Brevo SMS credits.
- `CLOUDINARY_*`: used for complaint photos and visitor photos.
- `PORT=5050` on a Mac, because port 5000 is taken by AirPlay.

### Create the first accounts

```bash
npm run create-staff -- director "Hostel Director" 9876543210 secret123
npm run create-staff -- mess_admin "Mess Admin" 9876500000 mess1234
```

Login ID = the 10-digit mobile number, password = what you typed (min 6 letters).
Run the same command again to reset a password.
The director adds everyone else (warden, attender, electrician, plumber…) from the app: **Staff Accounts → Add staff**.

The old Chef login `123321 / 321123` still opens the mess dashboard.

### Deploy on Render
Create a **new** Render web service from the `ami_backend` repo. Do not deploy it to the Chef service.
- Build command: `npm install`. Start command: `npm start`.
- Add all the `.env` values in Render → Environment.
- Copy the URL Render gives you (e.g. `https://ami-backend-xxxx.onrender.com`).

---

## 2. Put your server URL in the apps

The apps use `https://ami-backend.onrender.com` right now. Replace it with your Render URL in these files:

| App | File |
|---|---|
| student | `lib/api/api_endpoint.dart` → `serverUrl` |
| admin | `lib/apis/apis_localhost.dart` → `baseUrl` (keep `/api` at the end) |
| admin | `lib/screens/homeScreen.dart` → `statusUrl` |
| admin | `lib/screens/studetns_feesbackscreen.dart` |

Tip: in VS Code press Ctrl/Cmd + Shift + H, then find `ami-backend.onrender.com` and replace all.

---

## 3. Student app

```bash
cd ami_student
flutter pub get
flutter run
```
- Login is the same as Chef (email OTP).
- Package id: `com.amihostlers.jaipur.student`. Desugaring is already on in `android/app/build.gradle.kts`.
- To publish on Play Store, create a **new** keystore. The Chef keystore was removed on purpose.
  ```bash
  keytool -genkey -v -keystore android/app/upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
  ```
  Then create `android/key.properties` with storePassword, keyPassword, keyAlias=upload and storeFile=upload-keystore.jks.

## 4. Admin / staff app

```bash
cd ami_admin
flutter pub get
flutter run
```
- Package id: `com.amihostlers.jaipur.admin`.
- If you get a "file_picker / compileSdk 36" error: `file_picker` is already updated to ^10.2.4, so run `flutter clean && flutter pub get`.
- If you get a desugaring error, add only these lines to `android/app/build.gradle.kts`:
  ```kotlin
  android { compileOptions { isCoreLibraryDesugaringEnabled = true } }
  dependencies { coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4") }
  ```

### Who sees what in the admin app

| Login role | Opens |
|---|---|
| Mess admin (or `123321`) | The same Chef mess dashboard, nothing changed |
| Director | Hostel Dashboard: complaints, escalated, SOS, visitors, students, **Staff Accounts**, repair-team report |
| Warden | Hostel Dashboard plus **Write warden report** on complaints open longer than 48h |
| Attender | Hostel Dashboard: assigns jobs to workers and checks visitors out |
| Electrician / plumber / carpenter / cleaner | **My Jobs**: accept a job, then mark it repaired with a photo |

**SOS:** when a student holds the SOS button, the phones of the director, warden and attender open a red alarm screen and ring loudly. The ringing continues until someone presses **"I'M GOING"**. They also get an SMS and email through Brevo. Keep the admin app open or in the background on those phones. You can use **⋮ → Test SOS alarm** on the dashboard to check the sound.

**Visitor QR:** open `https://YOUR-SERVER/gate-qr` (also on the dashboard as **Gate QR Poster**), then print it and stick it at the gate. Visitors scan it and fill in the form with a photo, and the entry shows up in **Visitor Register**.

---

## 5. Complaint flow

1. The student raises a complaint (electrical / plumbing / carpentry / cleaning / other) with an optional photo. The matching repair team and the attender get notified.
2. A worker presses **Accept**, and the student sees "Coming to fix".
3. The worker presses **Mark repaired** and adds a note and photo. The student confirms with a rating, or reopens the complaint.
4. Not fixed in **48 h**: the complaint moves to the warden, who writes the reason and the action taken.
5. Not fixed in **64 h**: the complaint moves to the director, who does the final close.
6. Repaired but the student never confirmed: the complaint auto-closes after 72 h.

You can change the hours in `.env` (`ESCALATE_*`).
