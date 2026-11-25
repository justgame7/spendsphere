package com.spendsphere.app;

import android.Manifest;
import android.database.Cursor;
import android.net.Uri;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.regex.Pattern;

/**
 * Reads the SMS inbox on-device and returns only messages that look like money alerts
 * (they mention Rs / INR / ₹ followed by a number). Nothing leaves the phone.
 */
@CapacitorPlugin(
    name = "SmsReader",
    permissions = { @Permission(alias = "sms", strings = { Manifest.permission.READ_SMS }) }
)
public class SmsReaderPlugin extends Plugin {

    private static final Pattern MONEY = Pattern.compile("(?i)(rs\\.?|inr|₹)\\s*:?\\s*[0-9]");

    @PluginMethod
    public void getMessages(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            requestPermissionForAlias("sms", call, "smsPermissionCallback");
            return;
        }
        read(call);
    }

    @PermissionCallback
    private void smsPermissionCallback(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) read(call);
        else call.reject("SMS permission denied");
    }

    private void read(PluginCall call) {
        final long since = call.getLong("since", 0L);
        final int limit = call.getInt("limit", 30000);
        new Thread(() -> {
            JSArray out = new JSArray();
            String[] cols = { "_id", "address", "body", "date" };
            try (Cursor c = getContext().getContentResolver().query(
                    Uri.parse("content://sms/inbox"), cols,
                    "date >= ?", new String[] { String.valueOf(since) },
                    "date DESC")) {
                if (c != null) {
                    int n = 0;
                    while (c.moveToNext() && n < limit) {
                        String body = c.getString(2);
                        if (body == null || !MONEY.matcher(body).find()) continue;
                        JSObject m = new JSObject();
                        m.put("id", c.getLong(0));
                        m.put("address", c.getString(1));
                        m.put("body", body);
                        m.put("date", c.getLong(3));
                        out.put(m);
                        n++;
                    }
                }
                JSObject ret = new JSObject();
                ret.put("messages", out);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Could not read SMS: " + e.getMessage(), e);
            }
        }).start();
    }
}
