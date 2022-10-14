#!/usr/bin/gjs

const { Adw, Gdk, Gio, GLib, GObject, Gtk, Pango } = imports.gi;

var ValueType = {
  B: 'Boolean',
  I: 'Integer',
  D: 'Double',
  S: 'String',
  C: 'Color',
  AS: 'StringArray',
};

class PrefKeys {
  constructor() {
    this._keys = {};
    this._signals = [];
  }

  setKeys(keys) {
    Object.keys(keys).forEach((name) => {
      let key = keys[name];
      this.setKey(
        name,
        key.value_type,
        key.default_value,
        key.widget_type,
        key.key_maps
      );
    });
  }

  setKey(name, value_type, default_value, widget_type, key_maps) {
    this._keys[name] = {
      name,
      value_type,
      default_value,
      widget_type,
      value: default_value,
      maps: key_maps,
      object: null,
    };
  }

  setValue(name, value) {
    this._keys[name].value = value;
    if (this.onSetValue) {
      this.onSetValue(name, this._keys[name].value);
    }
  }

  getKey(name) {
    return this._keys[name];
  }

  getValue(name) {
    let value = this._keys[name].value;
    if (this.onGetValue) {
      value = this.onGetValue(name, value);
    }
    return value;
  }

  reset(name) {
    this.setValue(name, this._keys[name].default_value);
  }

  resetAll() {
    Object.keys(this._keys).forEach((k) => {
      this.reset(k);
    });
  }

  keys() {
    return this._keys;
  }

  // onSetValue(name, value) {
  // }

  // onGetValue(name, value) {
  //   return value;
  // }

  connectSignals(builder) {
    let self = this;
    let keys = this._keys;
    Object.keys(keys).forEach((name) => {
      let key = keys[name];
      let signal_id = null;
      key.object = builder.get_object(key.name);
      switch (key.widget_type) {
        case 'switch': {
          signal_id = key.object.connect('state-set', (w) => {
            let value = w.get_active();
            self.setValue(name, value);
            // print(value);
          });
          break;
        }
        case 'dropdown': {
          signal_id = key.object.connect('notify::selected-item', (w) => {
            let index = w.get_selected();
            let value = index in key.maps ? key.maps[index] : index;
            self.setValue(name, value);
            print(value);
          });
          break;
        }
        case 'scale': {
          signal_id = key.object.connect('value-changed', (w) => {
            let value = w.get_value();
            self.setValue(name, value);
            // print(value);
          });
          break;
        }
        case 'button': {
          signal_id = key.object.connect('clicked', (w) => {
            if (key.callback) {
              key.callback();
            }
          });
          break;
        }
      }

      this._signals.push({
        source: key.object,
        signal_id: signal_id,
      });
    });
  }
}

let prefKeys = new PrefKeys();
prefKeys.setKeys({
  'animation-fps': {
    value_type: ValueType.I,
    default_value: 0,
    widget_type: 'dropdown',
    key_maps: {},
  },
});

let app = new Adw.Application({
  application_id: 'com.dash2dock-lite.GtkApplication',
});

app.connect('activate', (me) => {
  m = new Gtk.ApplicationWindow({ application: me });
  m.set_default_size(600, 250);
  m.set_title('Prefs Test');

  let iconTheme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
  iconTheme.add_search_path('ui/icons');

  w = new Adw.PreferencesWindow();
  // w.add(new Adw.PreferencesPage());

  let builder = new Gtk.Builder();
  builder.add_from_file(`ui/general.ui`);
  builder.add_from_file(`ui/appearance.ui`);
  builder.add_from_file(`ui/tweaks.ui`);
  builder.add_from_file(`ui/menu.ui`);
  w.add(builder.get_object('tweaks'));
  w.add(builder.get_object('general'));
  w.add(builder.get_object('appearance'));

  let menu_util = builder.get_object('menu_util');
  w.add(menu_util);
  w.title = 'Dash2Dock Lite';

  const page = builder.get_object('menu_util');
  const pages_stack = page.get_parent(); // AdwViewStack
  const content_stack = pages_stack.get_parent().get_parent(); // GtkStack
  const preferences = content_stack.get_parent(); // GtkBox
  const headerbar = preferences.get_first_child(); // AdwHeaderBar
  headerbar.pack_start(builder.get_object('info_menu'));

  // setup menu actions
  const actionGroup = new Gio.SimpleActionGroup();
  w.insert_action_group('prefs', actionGroup);

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
      Gtk.show_uri(w, action.link, Gdk.CURRENT_TIME)
    );
    actionGroup.add_action(act);
  });

  w.remove(menu_util);

  prefKeys.connectSignals(builder);
  // prefKeys.getKey('reset').callback = () => {
  //   prefKeys.reset('brightness_scale');
  //   print(prefKeys.getValue('brightness_scale'));
  //   print('reset');
  // };

  w.connect('close_request', () => {
    m.close();
    app.quit();
  });

  w.show();

  // m.present();
});

app.connect('startup', () => {});

app.run(['xx']);
