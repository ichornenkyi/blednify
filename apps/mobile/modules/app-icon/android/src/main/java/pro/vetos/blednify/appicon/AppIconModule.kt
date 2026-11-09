package pro.vetos.blednify.appicon

import android.content.ComponentName
import android.content.pm.PackageManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Switches the launcher icon between the `.AppIcon_<id>` activity aliases that plugins/with-app-icons.js declares.
 * The aliases' enabled states are the only stored state: they survive app updates and restarts.
 */
class AppIconModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun component(id: String) = ComponentName(context.packageName, "${context.packageName}.AppIcon_$id")

  override fun definition() = ModuleDefinition {
    Name("AppIcon")

    /** The id among `ids` whose alias is enabled, or null when every alias is at its manifest default. */
    Function("getIcon") { ids: List<String> ->
      val pm = context.packageManager
      ids.firstOrNull { pm.getComponentEnabledSetting(component(it)) == PackageManager.COMPONENT_ENABLED_STATE_ENABLED }
    }

    /** Enables `id` first, then disables every other alias, so there is never a moment without a launcher entry. */
    Function("setIcon") { id: String, ids: List<String> ->
      val pm = context.packageManager
      pm.setComponentEnabledSetting(component(id), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
      for (other in ids) {
        if (other == id) continue
        pm.setComponentEnabledSetting(component(other), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
      }
    }
  }
}
