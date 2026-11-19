// Stores the Google OAuth client ID as the "Secret text" credential the Jenkinsfile expects.
import com.cloudbees.plugins.credentials.CredentialsScope
import com.cloudbees.plugins.credentials.SystemCredentialsProvider
import com.cloudbees.plugins.credentials.domains.Domain
import hudson.util.Secret
import org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl

def credentialId = 'safeinbox-google-client-id'
def clientId = System.getenv('GOOGLE_CLIENT_ID')
def provider = SystemCredentialsProvider.getInstance()
def existing = provider.credentials.find { it.id == credentialId }

if (!clientId) {
    println "[safeinbox] GOOGLE_CLIENT_ID is not set - add the '${credentialId}' credential in Jenkins yourself."
} else {
    def credential = new StringCredentialsImpl(
        CredentialsScope.GLOBAL, credentialId, 'Google OAuth client ID for SafeInbox', Secret.fromString(clientId))
    if (existing) {
        provider.store.updateCredentials(Domain.global(), existing, credential)
    } else {
        provider.store.addCredentials(Domain.global(), credential)
        println "[safeinbox] Added credential '${credentialId}'"
    }
}
