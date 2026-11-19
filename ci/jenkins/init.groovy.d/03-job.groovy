// Creates the "SafeInbox" pipeline job: Jenkinsfile from GitHub, checked for new commits every ~5 minutes.
import hudson.plugins.git.BranchSpec
import hudson.plugins.git.GitSCM
import hudson.triggers.SCMTrigger
import jenkins.model.Jenkins
import org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition
import org.jenkinsci.plugins.workflow.job.WorkflowJob

def jobName = 'SafeInbox'
def repoUrl = System.getenv('SAFEINBOX_REPO_URL') ?: 'https://github.com/ritheshvreddy/SafeInbox.git'
def branch = System.getenv('SAFEINBOX_BRANCH') ?: 'main'
def jenkins = Jenkins.get()

if (jenkins.getItem(jobName) == null) {
    def scm = new GitSCM(GitSCM.createRepoList(repoUrl, null), [new BranchSpec("*/${branch}")], null, null, [])
    def definition = new CpsScmFlowDefinition(scm, 'Jenkinsfile')
    definition.lightweight = true

    def job = jenkins.createProject(WorkflowJob, jobName)
    job.description = "SafeInbox CI/CD - tests, builds and deploys ${repoUrl} (${branch}) with docker compose."
    job.definition = definition
    def trigger = new SCMTrigger('H/5 * * * *')
    job.addTrigger(trigger)
    trigger.start(job, true)
    job.save()
    println "[safeinbox] Created pipeline job '${jobName}' for ${repoUrl}"
}
