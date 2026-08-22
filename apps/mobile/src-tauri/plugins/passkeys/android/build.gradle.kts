plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "dev.ganov.pna.passkeys"
    compileSdk = 34

    defaultConfig {
        // Credential Manager works below this too, falling back to the older
        // FIDO2 path; 24 is the app's own floor.
        minSdk = 24
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.credentials:credentials:1.3.0")
    // Lets Credential Manager fall back to Google Play services on older devices.
    implementation("androidx.credentials:credentials-play-services-auth:1.3.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation(project(":tauri-android"))
}
