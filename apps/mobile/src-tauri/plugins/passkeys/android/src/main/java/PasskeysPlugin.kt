package dev.ganov.pna.passkeys

import android.app.Activity
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.CreateCredentialUnsupportedException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

@InvokeArg
class RequestArgs {
    lateinit var requestJson: String

    /**
     * Ответить тем, что уже есть, и молча сдаться, если ключа нет.
     *
     * Без этого системное окно на чистом устройстве показывает «войти нечем» и
     * ждёт, пока его закроют, — приложение узнаёт об отсутствии ключа только
     * после. С этим оно узнаёт сразу и предлагает создать ключ.
     */
    var immediate: Boolean = false
}

/**
 * Ключи доступа через системный менеджер учётных данных.
 *
 * Запрос и ответ — это ровно тот JSON, которым обмениваются сервер и WebAuthn;
 * плагин ничего в нём не разбирает и не хранит. Закрытый ключ остаётся в
 * хранилище устройства, наружу уходит только подпись.
 */
@TauriPlugin
class PasskeysPlugin(private val activity: Activity) : Plugin(activity) {
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private val manager by lazy { CredentialManager.create(activity) }

    @Command
    fun isAvailable(invoke: Invoke) {
        val result = JSObject()
        // Credential Manager exists on every supported version; whether a key can
        // actually be made is answered by the first attempt, not by a probe that
        // would show the user a dialog for nothing.
        result.put("available", true)
        invoke.resolve(result)
    }

    @Command
    fun create(invoke: Invoke) {
        val args = invoke.parseArgs(RequestArgs::class.java)
        scope.launch {
            try {
                val response = manager.createCredential(
                    activity,
                    CreatePublicKeyCredentialRequest(requestJson = args.requestJson),
                ) as CreatePublicKeyCredentialResponse

                invoke.resolve(JSObject().put("responseJson", response.registrationResponseJson))
            } catch (error: CreateCredentialCancellationException) {
                invoke.reject("CANCELLED: ${error.message ?: "отменено"}")
            } catch (error: CreateCredentialUnsupportedException) {
                invoke.reject("UNSUPPORTED: ${error.message ?: "не поддерживается"}")
            } catch (error: CreateCredentialException) {
                invoke.reject(error.message ?: error.type)
            }
        }
    }

    @Command
    fun get(invoke: Invoke) {
        val args = invoke.parseArgs(RequestArgs::class.java)
        scope.launch {
            try {
                val request = GetCredentialRequest.Builder()
                    .addCredentialOption(GetPublicKeyCredentialOption(requestJson = args.requestJson))
                    .setPreferImmediatelyAvailableCredentials(args.immediate)
                    .build()
                val response = manager.getCredential(activity, request)
                val credential = response.credential as? PublicKeyCredential
                    ?: return@launch invoke.reject("Менеджер вернул не ключ доступа")

                invoke.resolve(JSObject().put("responseJson", credential.authenticationResponseJson))
            } catch (error: GetCredentialCancellationException) {
                invoke.reject("CANCELLED: ${error.message ?: "отменено"}")
            } catch (error: NoCredentialException) {
                // Ключа на этом устройстве нет — это не отказ пользователя, а
                // другая развилка: приложению нужно предложить завести аккаунт
                // или подключить устройство, а не говорить «вход отменён».
                invoke.reject("NO_CREDENTIAL: подходящего ключа на устройстве нет")
            } catch (error: GetCredentialException) {
                invoke.reject(error.message ?: error.type)
            }
        }
    }
}
