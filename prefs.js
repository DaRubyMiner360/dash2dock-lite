// loosely based on JustPerfection & Blur-My-Shell

const { Adw, Gdk, GLib, Gtk, GObject, Gio, Pango } = imports.gi;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const { SettingsKeys } = Me.imports.preferences.keys;
const UIFolderPath = Me.dir.get_child('ui').get_path();

const Gettext = imports.gettext.domain('dash2dock-lite');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;

const { schemaId, settingsKeys } = Me.imports.preferences.keys;

function init() {
  let iconTheme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
  iconTheme.add_search_path(`${UIFolderPath}/icons`);
  ExtensionUtils.initTranslations();
}

function addMenu(window, builder) {
  let menu_util = builder.get_object('menu_util');
  window.add(menu_util);

  const page = builder.get_object('menu_util');
  const pages_stack = page.get_parent(); // AdwViewStack
  const content_stack = pages_stack.get_parent().get_parent(); // GtkStack
  const preferences = content_stack.get_parent(); // GtkBox
  const headerbar = preferences.get_first_child(); // AdwHeaderBar
  headerbar.pack_start(builder.get_object('info_menu'));

  // setup menu actions
  const actionGroup = new Gio.SimpleActionGroup();
  window.insert_action_group('prefs', actionGroup);

  // a list of actions with their associated link
  const actions = [
    {
      name: 'open-bug-report',
      link: 'https://github.com/icedman/dash2dock-lite/issues',
    },
    {
      name: 'open-readme',
      link: 'https://github.com/icedman/dash2dock-lite',
    },
    {
      name: 'open-license',
      link: 'https://github.com/icedman/dash2dock-lite/blob/master/LICENSE',
    },
  ];

  actions.forEach((action) => {
    let act = new Gio.SimpleAction({ name: action.name });
    act.connect('activate', (_) =>
      Gtk.show_uri(window, action.link, Gdk.CURRENT_TIME)
    );
    actionGroup.add_action(act);
  });

  window.remove(menu_util);
}

function buildPrefsWidget() {
  let notebook = new Gtk.Notebook();

  let builder = new Gtk.Builder();
  builder.add_from_file(`${UIFolderPath}/legacy/general.ui`);
  builder.add_from_file(`${UIFolderPath}/legacy/appearance.ui`);
  builder.add_from_file(`${UIFolderPath}/legacy/tweaks.ui`);
  builder.add_from_file(`${UIFolderPath}/legacy/others.ui`);
  builder.add_from_file(`${UIFolderPath}/menu.ui`);
  notebook.append_page(
    builder.get_object('general'),
    new Gtk.Label({ label: _('General') })
  );
  notebook.append_page(
    builder.get_object('appearance'),
    new Gtk.Label({ label: _('Appearance') })
  );
  notebook.append_page(
    builder.get_object('tweaks'),
    new Gtk.Label({ label: _('Tweaks') })
  );
  notebook.append_page(
    builder.get_object('others'),
    new Gtk.Label({ label: _('Others') })
  );

  SettingsKeys.connectBuilder(builder);
  SettingsKeys.connectSettings(ExtensionUtils.getSettings(schemaId));

  notebook.connect('realize', () => {
    let gtkVersion = Gtk.get_major_version();
    let w = gtkVersion === 3 ? notebook.get_toplevel() : notebook.get_root();
    addMenu(w, builder);
  });
  return notebook;
}

function fillPreferencesWindow(window) {
  let builder = new Gtk.Builder();

  builder.add_from_file(`${UIFolderPath}/general.ui`);
  builder.add_from_file(`${UIFolderPath}/appearance.ui`);
  builder.add_from_file(`${UIFolderPath}/tweaks.ui`);
  builder.add_from_file(`${UIFolderPath}/others.ui`);
  builder.add_from_file(`${UIFolderPath}/menu.ui`);
  window.add(builder.get_object('general'));
  window.add(builder.get_object('appearance'));
  window.add(builder.get_object('tweaks'));
  window.add(builder.get_object('others'));
  window.set_search_enabled(true);

  SettingsKeys.connectBuilder(builder);
  SettingsKeys.connectSettings(ExtensionUtils.getSettings(schemaId));

  addMenu(window, builder);
}
