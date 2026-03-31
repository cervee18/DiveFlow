import { getGlobalProfile, getPublicReferences } from "./actions";
import ProfileForm from "./components/ProfileForm";

export default async function ProfilePage() {
  const { profile, userAuth, error } = await getGlobalProfile();
  const { certOrgs, certLevels } = await getPublicReferences();

  if (error || !profile) {
    return (
      <div className="p-8 text-center text-slate-500">
        Authentication Error: Please sign in again.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 relative overflow-y-auto">
      {/* Decorative Header */}
      <div className="h-40 bg-gradient-to-r from-teal-500 to-indigo-600 shrink-0"></div>

      <div className="max-w-4xl mx-auto w-full px-6 -mt-16 pb-12 z-10">
        <ProfileForm 
          profile={profile} 
          userAuth={userAuth} 
          certOrgs={certOrgs} 
          certLevels={certLevels} 
        />
      </div>
    </div>
  );
}
