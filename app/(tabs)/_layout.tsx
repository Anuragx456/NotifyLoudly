import { Tabs } from "expo-router";
import { NavBar } from "@/components/NavBar";
import { useAppTheme } from "@/components/ThemeProvider";

export default function TabsLayout() {
  const { theme } = useAppTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: "none",
        sceneStyle: { backgroundColor: theme.paper },
      }}
      tabBar={() => <NavBar />}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="history" options={{ title: "History" }} />
      <Tabs.Screen name="diagnostics" options={{ title: "Diagnostics" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
