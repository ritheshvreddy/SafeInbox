// Creates the Jenkins admin account on first start (replaces the browser setup wizard).
// Runs on every start but only acts while Jenkins has no user database yet.
import hudson.security.FullControlOnceLoggedInAuthorizationStrategy
import hudson.security.HudsonPrivateSecurityRealm
import jenkins.model.Jenkins
import jenkins.model.JenkinsLocationConfiguration

def jenkins = Jenkins.get()
def username = System.getenv('JENKINS_ADMIN_USER') ?: 'admin'
def password = System.getenv('JENKINS_ADMIN_PASSWORD')

if (!(jenkins.securityRealm instanceof HudsonPrivateSecurityRealm)) {
    if (!password) {
        println '[safeinbox] JENKINS_ADMIN_PASSWORD is not set - Jenkins is left without a login. Set it in ci/jenkins/.env.'
    } else {
        def realm = new HudsonPrivateSecurityRealm(false)
        realm.createAccount(username, password)
        jenkins.securityRealm = realm

        def strategy = new FullControlOnceLoggedInAuthorizationStrategy()
        strategy.allowAnonymousRead = false
        jenkins.authorizationStrategy = strategy
        jenkins.save()
        println "[safeinbox] Created Jenkins admin user '${username}'"
    }
}

def location = JenkinsLocationConfiguration.get()
if (!location.url) {
    location.url = System.getenv('JENKINS_URL') ?: 'http://localhost:8080/'
    location.save()
}
