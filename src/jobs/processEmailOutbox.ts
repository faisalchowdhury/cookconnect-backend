/** Cron stub — mark pending notification emails as sent when the model exists. */
export async function processEmailOutbox(): Promise<number> {
  try {
    const { Notification } = await import('@/modules/notification/notification.model');
    const pending = await Notification.find({ emailSentAt: null }).limit(100);
    if (pending.length === 0) return 0;

    const now = new Date();
    await Notification.updateMany(
      { _id: { $in: pending.map((notification) => notification._id) } },
      { emailSentAt: now },
    );

    return pending.length;
  } catch {
    return 0;
  }
}
